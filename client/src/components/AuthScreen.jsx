import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen({ onSubmit, error, submitting }) {
  const [mode, setMode] = useState("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  function switchMode(next) {
    setMode(next);
    setPassword("");
    setLocalError("");
  }

  function submit(event) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (mode === "register" && (displayName.trim().length < 2 || displayName.trim().length > 24)) {
      setLocalError("Display name should be 2–24 characters.");
      return;
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      setLocalError("Enter a valid email.");
      return;
    }
    if (password.length < 8 || password.length > 72) {
      setLocalError("Use a password between 8 and 72 characters.");
      return;
    }
    setLocalError("");
    onSubmit({
      mode,
      email: cleanEmail,
      password,
      displayName: displayName.trim(),
    });
  }

  const message = localError || error;

  return (
    <main className="gate">
      <section className="gate-copy">
        <p className="brand">ProxiSpeak</p>
        <h1>Walk over and talk.</h1>
        <p>
          A virtual office for the Infotact team. Move closer and a teammate’s voice gets louder.
          Step away and it fades out.
        </p>
      </section>
      <section className="gate-card">
        <h2>{mode === "login" ? "Log in" : "Create an account"}</h2>
        <form onSubmit={submit}>
          {mode === "register" && (
            <label>
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="nickname"
                maxLength={24}
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>
          {message && <p className="form-error">{message}</p>}
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
        {mode === "login" ? (
          <button className="text-button" type="button" onClick={() => switchMode("register")}>
            Need an account? Create one
          </button>
        ) : (
          <button className="text-button" type="button" onClick={() => switchMode("login")}>
            Already have an account? Log in
          </button>
        )}
      </section>
    </main>
  );
}
