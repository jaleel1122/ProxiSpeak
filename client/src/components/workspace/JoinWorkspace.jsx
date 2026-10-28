import React, { useState, useEffect } from 'react';

/**
 * JoinWorkspace Component
 * 
 * Clean entry screen for ProxiSpeak:
 * - Brand heading: PROXISPEAK
 * - Tagline: "Spatial conversations for virtual teams."
 * - Display name input (required, trimmed, max 20 characters)
 * - "Join Workspace" action
 * - Enter key support
 * - Session storage persistence
 * - No auth, email, password, or database
 */
export default function JoinWorkspace({ onJoin, socketConnected = false }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  // Restore name from sessionStorage if previously entered
  useEffect(() => {
    try {
      const savedName = sessionStorage.getItem('proxispeak_username');
      if (savedName) {
        setName(savedName);
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError('Please enter your name to join the workspace.');
      return;
    }

    if (trimmed.length > 20) {
      setError('Display name must be 20 characters or fewer.');
      return;
    }

    setError('');

    // Persist in sessionStorage for smooth reload experience
    try {
      sessionStorage.setItem('proxispeak_username', trimmed);
    } catch {
      // Ignore storage errors
    }

    onJoin(trimmed);
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        {/* Brand Header */}
        <div className="join-brand">
          <div className="join-logo-badge">
            <span className="join-dot"></span>
            <span>Virtual Space</span>
          </div>
          <h1 className="join-title">PROXISPEAK</h1>
          <p className="join-tagline">Spatial conversations for virtual teams.</p>
        </div>

        {/* Join Form */}
        <form onSubmit={handleSubmit} className="join-form" noValidate>
          <div className="join-field">
            <label htmlFor="displayNameInput" className="join-label">
              Display Name
            </label>
            <input
              id="displayNameInput"
              type="text"
              className={`join-input ${error ? 'input-error' : ''}`}
              placeholder="Enter your name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              maxLength={20}
              autoFocus
              autoComplete="name"
              spellCheck={false}
            />
            <div className="input-meta">
              <span className="char-count">{name.length}/20</span>
            </div>
          </div>

          {error && (
            <div className="join-error" role="alert">
              <span className="error-icon">!</span>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="join-btn" id="joinWorkspaceBtn">
            Join Workspace
          </button>
        </form>

        {/* System Link Status */}
        <div className="join-footer">
          <div className="connection-indicator">
            <span
              className={`status-dot ${socketConnected ? 'online' : 'connecting'}`}
            ></span>
            <span className="status-text">
              {socketConnected ? 'Server Connected' : 'Connecting to Server...'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
