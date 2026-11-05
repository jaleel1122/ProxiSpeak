import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api.js";
import { SpatialMixer } from "./audio/SpatialMixer.js";
import AuthScreen from "./components/AuthScreen.jsx";
import Lobby from "./components/Lobby.jsx";
import OfficeApp from "./components/OfficeApp.jsx";

export default function App() {
  const [booting, setBooting] = useState(() => Boolean(getToken()));
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) return undefined;
    let cancelled = false;
    api("/api/auth/me")
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        setToken(null);
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAuth({ mode, email, password, displayName }) {
    setError("");
    setSubmitting(true);
    try {
      const path = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = mode === "register" ? { email, password, displayName } : { email, password };
      const data = await api(path, { method: "POST", body: JSON.stringify(body) });
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setError(err.message || "Could not sign you in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore network errors on logout */
    }
    setSession(null);
    setToken(null);
    setUser(null);
    setError("");
  }

  async function enterOffice() {
    setError("");
    setEntering(true);
    const mixer = new SpatialMixer();
    try {
      await mixer.unlock();
      let stream = null;
      let micNote = "";
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      } catch {
        micNote = "Microphone is off. You can still hear people nearby.";
      }
      setSession({ stream, mixer, micNote });
    } catch {
      mixer.close();
      setError("Could not start audio in this browser.");
    } finally {
      setEntering(false);
    }
  }

  if (booting) {
    return (
      <main className="gate">
        <section className="gate-card">
          <p className="brand">ProxiSpeak</p>
          <p className="quiet">Checking your session…</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return <AuthScreen onSubmit={submitAuth} error={error} submitting={submitting} />;
  }

  if (!session) {
    return (
      <Lobby user={user} entering={entering} error={error} onEnter={enterOffice} onLogout={logout} />
    );
  }

  return (
    <OfficeApp
      user={user}
      stream={session.stream}
      mixer={session.mixer}
      micNote={session.micNote}
      onLeave={(message) => {
        setSession(null);
        if (message) setError(message);
      }}
      onAuthExpired={() => {
        setSession(null);
        setUser(null);
        setError("Please log in again.");
      }}
    />
  );
}
