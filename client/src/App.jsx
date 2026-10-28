import React, { useState, useEffect } from 'react';
import socket from './services/socket';
import JoinWorkspace from './components/workspace/JoinWorkspace';
import Workspace from './components/workspace/Workspace';

/**
 * App Component - Root ProxiSpeak Controller
 * 
 * Manages:
 * - Active workspace joining lifecycle (Join Workspace Screen -> Main Office Workspace)
 * - Persistent display name management
 * - Socket.IO client connection monitoring (ready for Phase 3 multiplayer sync)
 */
export default function App() {
  const [username, setUsername] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);

  // Monitor Socket.IO connection status
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const handleJoin = (displayName) => {
    setUsername(displayName);
    setHasJoined(true);
  };

  const handleLeave = () => {
    setHasJoined(false);
  };

  return (
    <div className="proxispeak-app">
      {!hasJoined ? (
        <JoinWorkspace onJoin={handleJoin} socketConnected={isConnected} />
      ) : (
        <Workspace
          username={username}
          onLeave={handleLeave}
          socketConnected={isConnected}
        />
      )}
    </div>
  );
}
