import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

/**
 * Socket.IO client instance configured for the ProxiSpeak backend.
 * Auto-connect is enabled so that connection is established on app initialization.
 */
export const socket = io(SERVER_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling']
});

export default socket;
