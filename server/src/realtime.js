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
      sdp.sdp.length > 0 &&
      sdp.sdp.length < 20_000
  );
}

function isCandidate(candidate) {
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      typeof candidate.candidate === "string" &&
      candidate.candidate.length < 2_000
  );
}

export function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] },
    pingInterval: 10_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 100_000,
  });

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

  async function relay(socket, event, payload) {
    const to = payload?.to;
    if (typeof to !== "string" || !to || to === socket.user.id) return;
    const from = getPlayer(socket.user.id);
    const target = getPlayer(to);
    if (!from || !target || !from.linked.includes(to)) return;

    let allowed = false;
    try {
      allowed = await pairWithinLeave(from, target);
    } catch (err) {
      console.error("Signal check failed:", err.message);
      return;
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

