import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_URL, getToken, setToken } from "../api.js";
import { PeerManager } from "../webrtc/PeerManager.js";
import OfficeScene from "../office/OfficeScene.jsx";
import Hud from "./Hud.jsx";

export default function OfficeApp({ user, stream, mixer, micNote, onLeave, onAuthExpired }) {
  const [office, setOffice] = useState(null);
  const [you, setYou] = useState(null);
  const [players, setPlayers] = useState([]);
  const [peers, setPeers] = useState([]);
  const [snap, setSnap] = useState(null);
  const [status, setStatus] = useState("Connecting…");
  const [notice, setNotice] = useState(micNote || "");
  const [micOn, setMicOn] = useState(Boolean(stream));
  const [deafened, setDeafened] = useState(false);

  const streamRef = useRef(stream);
  const distancesRef = useRef({});
  const onLeaveRef = useRef(onLeave);
  const onAuthExpiredRef = useRef(onAuthExpired);
  onLeaveRef.current = onLeave;
  onAuthExpiredRef.current = onAuthExpired;

  const socketMove = useRef(null);
  const onMove = useCallback((x, y) => {
    socketMove.current?.(x, y);
  }, []);

  const onYaw = useCallback((yaw) => {
    mixer.setYaw(yaw);
  }, [mixer]);

  useEffect(() => {
    streamRef.current = stream;
    let alive = true;
    let replaced = false;
    const peersRef = { current: null };

    const socket = io(API_URL, {
      auth: { token: getToken() },
      autoConnect: false,
      transports: ["websocket", "polling"],
    });

    const peerManager = new PeerManager({
      socket,
      selfId: user.id,
      getLocalStream: () => streamRef.current,
      onRemoteStream: (id, remote) => {
        mixer.attach(id, remote);
        const info = distancesRef.current[id];
        if (info) mixer.update(id, info);
      },
      onPeerClosed: (id) => mixer.detach(id),
    });
    peersRef.current = peerManager;
    socketMove.current = (x, y) => socket.emit("avatar:move", { x, y });

    socket.on("connect", () => {
      if (!alive || replaced) return;
      setStatus("Joining…");
      socket
        .timeout(8000)
        .emitWithAck("office:join", {})
        .then((res) => {
          if (!alive) return;
          if (!res?.ok) throw new Error(res?.error || "Could not join the office.");
          mixer.setRanges({ loud: res.office.loud, earshot: res.office.earshot });
          setOffice(res.office);
          setYou(res.you);
          setPlayers(res.players.filter((player) => player.id !== res.you.id));
          setSnap({ x: res.you.x, y: res.you.y, seq: Date.now() });
          setStatus("In the office");
        })
        .catch((err) => {
          if (!alive) return;
          setNotice(err.message || "Could not join the office.");
          setStatus("Not connected");
        });
    });

    socket.on("connect_error", (err) => {
      const unauthorized = String(err?.message || "").toLowerCase().includes("unauthorized");
      if (unauthorized) {
        replaced = true;
        socket.io.reconnection(false);
        setToken(null);
        onAuthExpiredRef.current();
        return;
      }
      if (alive) setStatus("Reconnecting…");
    });

    socket.on("player:joined", (player) => {
      if (player.id === user.id) return;
      setPlayers((prev) => (prev.some((item) => item.id === player.id) ? prev : [...prev, player]));
    });

    socket.on("player:left", ({ id }) => {
      setPlayers((prev) => prev.filter((player) => player.id !== id));
      peerManager.close(id);
    });

    socket.on("avatar:moved", ({ id, x, y }) => {
      setPlayers((prev) => prev.map((player) => (player.id === id ? { ...player, x, y } : player)));
    });

    socket.on("office:snapshot", ({ players: roster }) => {
      setPlayers(roster.filter((player) => player.id !== user.id));
    });

    socket.on("avatar:correct", ({ x, y }) => {
      setSnap({ x, y, seq: Date.now() });
    });

    socket.on("proximity:update", ({ hearable, peers: nextPeers }) => {
      const list = nextPeers || [];
      const map = {};
      for (const peer of list) map[peer.id] = peer;
      distancesRef.current = map;
      setPeers(list);
      peerManager.syncHearable(hearable || []);
      for (const peer of list) mixer.update(peer.id, peer);
    });

    socket.on("session:replaced", () => {
      replaced = true;
      socket.io.reconnection(false);
      setNotice("You joined the office in another window. This one was closed.");
      onLeaveRef.current("You joined the office in another window.");
    });

    socket.on("session:revoked", () => {
      replaced = true;
      socket.io.reconnection(false);
      setToken(null);
      onAuthExpiredRef.current();
    });

    socket.on("disconnect", (reason) => {
      if (!alive || replaced) return;
      if (reason === "io client disconnect") return;
      peerManager.syncHearable([]);
      setStatus("Reconnecting…");
    });

    socket.connect();

    return () => {
      alive = false;
      socketMove.current = null;
      peerManager.destroy();
      socket.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      mixer.close();
    };
  }, [mixer, user.id]);

  function toggleMic() {
    const next = !micOn;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicOn(next);
  }

  function toggleDeafen() {
    const next = !deafened;
    mixer.setDeafened(next);
    setDeafened(next);
  }

  return (
    <main className="office">
      {you && office ? (
        <OfficeScene
          office={office}
          me={you}
          players={players}
          nearbyIds={peers.map((peer) => peer.id)}
          snap={snap}
          onMove={onMove}
          onYaw={onYaw}
        />
      ) : (
        <div className="scene scene-waiting">
          <p>{status}</p>
          <button className="primary" type="button" onClick={() => onLeave()}>
            Back
          </button>
        </div>
      )}
      {you && (
        <Hud
          you={you}
          players={players}
          peers={peers}
          status={status}
          notice={notice}
          micOn={micOn}
          micAvailable={Boolean(stream)}
          deafened={deafened}
          onMic={toggleMic}
          onDeafen={toggleDeafen}
          onLeave={() => onLeave()}
        />
      )}
    </main>
  );
}
