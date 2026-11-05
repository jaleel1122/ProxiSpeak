function meters(distance) {
  if (!Number.isFinite(distance)) return "";
  return `${Math.round(distance)} m`;
}

export default function Hud({
  you,
  players,
  peers,
  status,
  notice,
  micOn,
  micAvailable,
  deafened,
  onMic,
  onDeafen,
  onLeave,
}) {
  const names = new Map(players.map((player) => [player.id, player]));
  const peerRows = [...peers].sort((a, b) => a.distance - b.distance);
  const elsewhere = players.filter((player) => !peerRows.some((peer) => peer.id === player.id));

  return (
    <div className="hud">
      <header className="topbar">
        <div>
          <strong>ProxiSpeak</strong>
          <span>Infotact HQ</span>
        </div>
        <div className="top-actions">
          <span className="you-chip">
            <i style={{ background: you.color }} />
            {you.name}
          </span>
          <button type="button" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <aside className="people">
        <p className="panel-label">In range · {peerRows.length}</p>
        {peerRows.length === 0 && <p className="quiet">Walk closer to someone to hear them.</p>}
        {peerRows.map((peer) => {
          const person = names.get(peer.id);
          return (
            <div className="person" key={peer.id}>
              <i style={{ background: person?.color || "#2f9e6b" }} />
              <span>{person?.name || "Teammate"}</span>
              <em>{meters(peer.distance)}</em>
            </div>
          );
        })}
        {elsewhere.length > 0 && <p className="panel-label everyone">Elsewhere · {elsewhere.length}</p>}
        {elsewhere.map((player) => (
          <div className="person dim" key={player.id}>
            <i style={{ background: player.color }} />
            <span>{player.name}</span>
          </div>
        ))}
      </aside>

      <footer className="dock">
        <div>
          <strong>{status}</strong>
          <span>
            {peerRows.length
              ? `${peerRows.length} ${peerRows.length === 1 ? "person" : "people"} nearby`
              : "Nobody nearby"}
          </span>
        </div>
        <button type="button" className={micOn ? "on" : ""} onClick={onMic} disabled={!micAvailable}>
          {micOn ? "Mic on" : "Mic off"}
        </button>
        <button type="button" className={deafened ? "on" : ""} onClick={onDeafen}>
          {deafened ? "Deafened" : "Deafen"}
        </button>
      </footer>

      {notice && <p className="toast">{notice}</p>}
    </div>
  );
}
