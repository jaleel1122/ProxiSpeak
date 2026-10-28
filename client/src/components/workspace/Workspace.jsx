import React, { useState } from 'react';
import VirtualOffice from './VirtualOffice';
import { getInitials } from '../../utils/movement';

/**
 * Workspace Component
 * 
 * Layout for the active virtual office session:
 * - TOP BAR: PROXISPEAK | Main Office | Username (+ optional Leave action)
 * - CENTER: HTML5 Canvas occupying the main workspace area
 * - BOTTOM BAR: W A S D / Arrow Keys movement hints + active room zone badge
 */
export default function Workspace({ username, onLeave, socketConnected = false }) {
  const [currentZone, setCurrentZone] = useState({
    id: 'central-plaza',
    name: 'MAIN HALL',
    subtitle: 'Central Atrium & Walkways',
  });

  const initials = getInitials(username);

  return (
    <div className="workspace-view">
      {/* Top Bar */}
      <header className="workspace-header">
        <div className="header-left">
          <div className="brand-title">PROXISPEAK</div>
        </div>

        <div className="header-center">
          <div className="office-badge">
            <span className="room-indicator-dot"></span>
            <span className="office-title">Main Office</span>
          </div>
        </div>

        <div className="header-right">
          <div className="user-profile-chip" title={`Signed in as ${username}`}>
            <div className="user-avatar-mini">
              <span>{initials}</span>
              <span className="user-status-dot online"></span>
            </div>
            <span className="user-display-name">{username}</span>
          </div>
          {onLeave && (
            <button
              onClick={onLeave}
              className="leave-workspace-btn"
              title="Leave Workspace"
              id="leaveWorkspaceBtn"
            >
              Leave
            </button>
          )}
        </div>
      </header>

      {/* Main 2D Canvas Workspace */}
      <main className="workspace-main">
        <VirtualOffice username={username} onZoneChange={setCurrentZone} />
      </main>

      {/* Bottom Bar / Movement Hint */}
      <footer className="workspace-footer">
        <div className="footer-zone-indicator">
          <span className="zone-tag">Current Area:</span>
          <span className="zone-name">{currentZone.name}</span>
        </div>

        <div className="movement-hint">
          <span className="hint-keys">
            <kbd className="key-kbd">W</kbd>
            <kbd className="key-kbd">A</kbd>
            <kbd className="key-kbd">S</kbd>
            <kbd className="key-kbd">D</kbd>
          </span>
          <span className="hint-separator">/</span>
          <span className="hint-keys">
            <kbd className="key-kbd">↑</kbd>
            <kbd className="key-kbd">←</kbd>
            <kbd className="key-kbd">↓</kbd>
            <kbd className="key-kbd">→</kbd>
          </span>
          <span className="hint-text">to move</span>
        </div>

        <div className="footer-status">
          <span
            className={`status-indicator-dot ${socketConnected ? 'connected' : 'disconnected'}`}
          ></span>
          <span className="footer-status-text">
            {socketConnected ? 'Live' : 'Connecting'}
          </span>
        </div>
      </footer>
    </div>
  );
}
