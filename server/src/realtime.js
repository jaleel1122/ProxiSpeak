import { Server } from "socket.io";
import { ALLOWED_ORIGINS, OFFICE } from "./config.js";
import { authenticateSocket } from "./auth.js";
import {
  addPlayer,
  getPlayer,
  listPlayers,
  playerCount,
  removePlayer,
  toClient,
  tryMove,
} from "./players.js";
import {
  nearbyUsers,
  pairWithinLeave,
  proximityFor,
  removePresence,
  retainLive,
  syncPositions,
  upsertPresence,
} from "./presence.js";

export { playerCount };

function officeMeta() {
  return { ...OFFICE, pixelsPerMeter: 1 };
}

function isSdp(sdp, type) {
  return Boolean(
    sdp &&
      sdp.type === type &&
      typeof sdp.sdp === "string" &&
      sdp.sdp.length >= 10 &&
      sdp.sdp.length <= 15_000 &&
      (sdp.sdp.includes("v=") || sdp.sdp.includes("m=audio"))
  );
}

function isCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  const str = candidate.candidate;
  if (typeof str !== "string" || str.length === 0 || str.length > 1_500) return false;
  const mid = candidate.sdpMid;
  if (mid !== null && mid !== undefined && (typeof mid !== "string" || mid.length > 50)) return false;
  const mLine = candidate.sdpMLineIndex;
  if (mLine !== null && mLine !== undefined && (!Number.isInteger(mLine) || mLine < 0 || mLine > 100)) return false;
  return true;
}

/**
 * Token bucket rate limiter for movement events.
 * Normal client movement emits once every ~50ms (20 moves/sec).
 * Capacity: 10 moves (allows natural network jitter bursts).
 * Refill: 25 moves/sec.
 */
function checkMoveRate(socket) {
  const now = Date.now();
  const elapsed = (now - socket.moveBucketLast) / 1000;
  socket.moveBucket = Math.min(10, socket.moveBucket + elapsed * 25);
  socket.moveBucketLast = now;
  if (socket.moveBucket < 1) return false;
  socket.moveBucket -= 1;
  return true;
}

/**
 * Token bucket rate limiter for WebRTC signaling.
 * Allows initial negotiation bursts (offer + answer + 10-20 ICE candidates).
 * Socket capacity: 35 signals, refills at 10/sec.
 * Per-peer capacity: 25 signals, refills at 8/sec.
 */
function checkSignalRate(socket, toId) {
  const now = Date.now();
  const socketElapsed = (now - socket.signalBucketLast) / 1000;
  socket.signalBucket = Math.min(35, socket.signalBucket + socketElapsed * 10);
  socket.signalBucketLast = now;
  if (socket.signalBucket < 1) return false;

  if (!socket.peerSignalBuckets) socket.peerSignalBuckets = new Map();
  let peerBucket = socket.peerSignalBuckets.get(toId);
  if (!peerBucket) {
    peerBucket = { tokens: 25, last: now };
    socket.peerSignalBuckets.set(toId, peerBucket);
  } else {
    const peerElapsed = (now - peerBucket.last) / 1000;
    peerBucket.tokens = Math.min(25, peerBucket.tokens + peerElapsed * 8);
    peerBucket.last = now;
  }
  if (peerBucket.tokens < 1) return false;

  socket.signalBucket -= 1;
  peerBucket.tokens -= 1;
  return true;
}

let activeIo = null;

/**
 * Revokes active WebSocket sessions for a user whose session was invalidated or logged out.
 * Emits 'session:revoked' and forcefully closes sockets in the user's room.
 */
export function revokeUserSockets(userId) {
  if (!activeIo) return;
  const targetId = String(userId);
  activeIo.to(targetId).emit("session:revoked");
  activeIo.in(targetId).disconnectSockets(true);
  removePlayer(targetId);
  removePresence(targetId).catch(() => {});
}

export function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] },
    pingInterval: 10_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 100_000,
  });
  activeIo = io;

  io.use(authenticateSocket);

  let proximityTimer = null;
  let proximityRunning = false;
  let proximityAgain = false;

  async function pushProximity() {
    const live = listPlayers();
    await retainLive(live);
    if (!live.length) return;
    await syncPositions(live);
    for (const player of live) {
      const hits = await nearbyUsers(player);
      const snap = proximityFor(player, hits);
      const key = snap.peers
        .map((peer) => `${peer.id}:${Math.round(peer.distance)}:${Math.round(peer.dx)}:${Math.round(peer.dy)}`)
        .join("|");
      if (key === player.audioKey) continue;
      player.audioKey = key;
      io.to(player.socketId).emit("proximity:update", snap);
    }
  }

  async function runProximity() {
    if (proximityRunning) {
      proximityAgain = true;
      return;
    }
    proximityRunning = true;
    try {
      await pushProximity();
    } catch (err) {
      console.error("Proximity update failed:", err.message);
    } finally {
      proximityRunning = false;
      if (proximityAgain) {
        proximityAgain = false;
        runProximity();
      }
    }
  }

  function scheduleProximity() {
    if (proximityTimer || proximityRunning) {
      if (proximityRunning) proximityAgain = true;
      return;
    }
    proximityTimer = setTimeout(() => {
      proximityTimer = null;
      runProximity();
    }, 100);
  }

  // Proximity authorization cache to prevent Atlas signaling amplification DoS.
  // Stores verified Atlas pair authorizations with 1000ms TTL.
  // Immediately invalidated whenever users move past leave distance, leave, or disconnect.
  const proximityAuthCache = new Map();

  async function relay(socket, event, payload) {
    const to = payload?.to;
    if (typeof to !== "string" || !to || to === socket.user.id || to.length > 64) return;

    // Fix 2: Per-socket and per-peer signaling rate limiting
    if (!checkSignalRate(socket, to)) return;

    const from = getPlayer(socket.user.id);
    const target = getPlayer(to);
    if (!from || !target || !from.linked.includes(to)) return;

    // Fix 2: Real-time server-authoritative distance check
    // If users are beyond leave threshold, immediately discard signal and invalidate cache
    const realTimeDistance = Math.hypot(from.x - target.x, from.y - target.y);
    if (realTimeDistance > OFFICE.leave) {
      proximityAuthCache.delete(`${from.id}:${to}`);
      proximityAuthCache.delete(`${to}:${from.id}`);
      return;
    }

    // Fix 2: Efficient proximity authorization without unnecessary Atlas queries on every packet
    const pairKey = `${from.id}:${to}`;
    const cached = proximityAuthCache.get(pairKey);
    const now = Date.now();
    let allowed = false;

    if (cached && now - cached.at < 1000) {
      allowed = cached.allowed;
    } else {
      try {
        allowed = await pairWithinLeave(from, target);
        proximityAuthCache.set(pairKey, { allowed, at: now });
      } catch (err) {
        console.error("Signal check failed:", err.message);
        return;
      }
    }
    if (!allowed) return;

    const message = { from: socket.user.id };
    if (event === "webrtc:ice") {
      if (!isCandidate(payload.candidate)) return;
      message.candidate = {
        candidate: payload.candidate.candidate,
        sdpMid: payload.candidate.sdpMid ?? null,
        sdpMLineIndex: payload.candidate.sdpMLineIndex ?? null,
      };
    } else if (event === "webrtc:offer") {
      if (!isSdp(payload.sdp, "offer")) return;
      message.sdp = { type: "offer", sdp: payload.sdp.sdp };
    } else if (event === "webrtc:answer") {
      if (!isSdp(payload.sdp, "answer")) return;
      message.sdp = { type: "answer", sdp: payload.sdp.sdp };
    } else {
      return;
    }
    io.to(to).emit(event, message);
  }

  io.on("connection", (socket) => {
    let joined = false;
    socket.moveBucket = 10;
    socket.moveBucketLast = Date.now();
    socket.signalBucket = 35;
    socket.signalBucketLast = Date.now();
    socket.peerSignalBuckets = new Map();
    socket.join(socket.user.id);

    socket.on("office:join", async (payload, ack) => {
      const done = typeof ack === "function" ? ack : typeof payload === "function" ? payload : null;
      const reply = (body) => {
        if (done) done(body);
      };
      if (joined) {
        reply({ ok: false, error: "Already in the office." });
        return;
      }

      const { player, replacedSocketId } = addPlayer(socket.id, socket.user);
      try {
        await upsertPresence(player);
      } catch (err) {
        removePlayer(player.id);
        console.error(err);
        reply({ ok: false, error: "Could not join the office." });
        return;
      }

      if (!socket.connected) {
        removePlayer(player.id);
        await removePresence(player.id).catch(() => {});
        return;
      }

      if (replacedSocketId) {
        const previous = io.sockets.sockets.get(replacedSocketId);
        previous?.emit("session:replaced");
        previous?.disconnect(true);
      }

      joined = true;
      socket.join(OFFICE.id);
      socket.to(OFFICE.id).emit("player:joined", toClient(player));
      reply({
        ok: true,
        office: officeMeta(),
        you: toClient(player),
        players: listPlayers().map(toClient),
      });
      scheduleProximity();
    });

    socket.on("avatar:move", ({ x, y } = {}) => {
      if (!joined) return;
      if (!checkMoveRate(socket)) return;
      const result = tryMove(socket.user.id, Number(x), Number(y));
      if (!result.ok) {
        if (result.correct) socket.emit("avatar:correct", result.correct);
        return;
      }
      if (result.unchanged) return;
      socket.to(OFFICE.id).emit("avatar:moved", {
        id: result.player.id,
        x: result.player.x,
        y: result.player.y,
      });
      scheduleProximity();
    });

    socket.on("webrtc:offer", (payload) => {
      relay(socket, "webrtc:offer", payload);
    });
    socket.on("webrtc:answer", (payload) => {
      relay(socket, "webrtc:answer", payload);
    });
    socket.on("webrtc:ice", (payload) => {
      relay(socket, "webrtc:ice", payload);
    });

    socket.on("disconnect", () => {
      if (!joined) return;
      const current = getPlayer(socket.user.id);
      if (!current || current.socketId !== socket.id) return;
      removePlayer(socket.user.id);
      for (const key of proximityAuthCache.keys()) {
        if (key.startsWith(`${socket.user.id}:`) || key.endsWith(`:${socket.user.id}`)) {
          proximityAuthCache.delete(key);
        }
      }
      socket.to(OFFICE.id).emit("player:left", { id: socket.user.id });
      removePresence(socket.user.id)
        .then(() => scheduleProximity())
        .catch((err) => console.error("Leave failed:", err.message));
    });
  });

  setInterval(() => {
    const players = listPlayers();
    if (players.length < 2) return;
    io.to(OFFICE.id).emit("office:snapshot", { players: players.map(toClient) });
  }, 1000);

  return io;
}

