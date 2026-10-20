import React, { useState, useEffect } from 'react';
import socket from './services/socket';

export default function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [socketId, setSocketId] = useState(socket.id || null);
  const [transport, setTransport] = useState(socket.io?.engine?.transport?.name || 'N/A');
  const [healthStatus, setHealthStatus] = useState({ loading: true, data: null, error: null });

  const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      setSocketId(socket.id);
      setTransport(socket.io?.engine?.transport?.name || 'websocket');
    }

    function onDisconnect() {
      setIsConnected(false);
      setSocketId(null);
      setTransport('N/A');
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Initial check if already connected
    if (socket.connected) {
      onConnect();
    }

    // Check backend health route
    fetch(`${serverUrl}/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setHealthStatus({ loading: false, data, error: null });
      })
      .catch((err) => {
        setHealthStatus({ loading: false, data: null, error: err.message });
      });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [serverUrl]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand-badge">Base Architecture Initialized</div>
        <h1 className="app-title">ProxiSpeak</h1>
        <p className="app-subtitle">
          2D virtual workspace with proximity-based real-time communication.
        </p>
      </header>

      {/* Real-time Socket.IO & Backend Health Connection Status */}
      <section className={`status-card ${isConnected ? 'connected' : 'connecting'}`}>
        <div className="status-header">
          <div className="status-title">
            <span>Client ↔ Server Link</span>
          </div>
          <div className={`status-pill ${isConnected ? 'connected' : 'connecting'}`}>
            <span className={`pulse-dot ${isConnected ? 'connected' : 'connecting'}`}></span>
            <span>{isConnected ? 'Socket.IO Connected' : 'Connecting to Server...'}</span>
          </div>
        </div>

        <div className="status-grid">
          <div className="meta-item">
            <span className="meta-label">Backend URL</span>
            <span className="meta-value">{serverUrl}</span>
          </div>

          <div className="meta-item">
            <span className="meta-label">Socket ID</span>
            <span className="meta-value">{socketId || 'Pending handshake...'}</span>
          </div>

          <div className="meta-item">
            <span className="meta-label">Transport Protocol</span>
            <span className="meta-value">
              <span className="meta-badge">{transport}</span>
            </span>
          </div>

          <div className="meta-item">
            <span className="meta-label">Health Route (GET /health)</span>
            <span className="meta-value">
              {healthStatus.loading ? (
                'Checking...'
              ) : healthStatus.data ? (
                <span className="meta-badge" style={{ color: '#34d399' }}>
                  {healthStatus.data.status} ({healthStatus.data.service})
                </span>
              ) : (
                <span className="meta-badge" style={{ color: '#f87171' }}>
                  {healthStatus.error}
                </span>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* Architecture Foundations Overview */}
      <section>
        <h2 className="section-title">System Architecture</h2>
        <div className="architecture-grid">
          <div className="arch-card active">
            <div className="arch-icon">⚡</div>
            <h3 className="arch-title">Real-Time Coordination</h3>
            <p className="arch-desc">
              Socket.IO bidirectional channel established for future movement, presence synchronization, and WebRTC signaling.
            </p>
            <span className="arch-tag ready">Active Foundation</span>
          </div>

          <div className="arch-card upcoming">
            <div className="arch-icon">🏢</div>
            <h3 className="arch-title">2D Virtual Office Canvas</h3>
            <p className="arch-desc">
              HTML5 Canvas workspace rendering, avatar coordinates, and spatial room partitioning.
            </p>
            <span className="arch-tag planned">Phase 2</span>
          </div>

          <div className="arch-card upcoming">
            <div className="arch-icon">🎙️</div>
            <h3 className="arch-title">Proximity WebRTC Audio</h3>
            <p className="arch-desc">
              Peer-to-peer audio mesh with Web Audio API distance attenuation and spatial panning.
            </p>
            <span className="arch-tag planned">Phase 3</span>
          </div>

          <div className="arch-card upcoming">
            <div className="arch-icon">👥</div>
            <h3 className="arch-title">Workspace Presence & Chat</h3>
            <p className="arch-desc">
              Room participant roster, status controls, and in-workspace text messaging.
            </p>
            <span className="arch-tag planned">Phase 4</span>
          </div>
        </div>
      </section>

      <footer className="app-footer">
        <p>ProxiSpeak &bull; Clean Architecture Foundation &bull; Port 5173 (Client) &amp; Port 3001 (Server)</p>
      </footer>
    </div>
  );
}
