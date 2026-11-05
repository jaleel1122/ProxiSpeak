export default function Lobby({ user, entering, error, onEnter, onLogout }) {
  return (
    <main className="gate">
      <section className="gate-copy">
        <p className="brand">ProxiSpeak</p>
        <h1>Infotact HQ is open.</h1>
        <p>
          Use headphones if you can. You will hear people inside a 280 meter circle around you,
          and the voice moves between your ears as you turn.
        </p>
      </section>
      <section className="gate-card">
        <h2>Hello, {user.displayName}</h2>
        <p className="quiet">Click enter, allow the microphone, then walk up to someone to talk.</p>
        {error && <p className="form-error">{error}</p>}
        <button className="primary" type="button" onClick={onEnter} disabled={entering}>
          {entering ? "Opening the office…" : "Enter office"}
        </button>
        <button className="text-button" type="button" onClick={onLogout}>
          Log out
        </button>
      </section>
    </main>
  );
}
