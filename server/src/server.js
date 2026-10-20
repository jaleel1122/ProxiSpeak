import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import healthRoutes from './routes/health.routes.js';
import { registerSocketHandlers } from './socket/index.js';
import { corsOptions, getAllowedOrigins } from './config/cors.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3001;
const allowedOrigins = getAllowedOrigins();

const app = express();
const server = http.createServer(app);

// Configure CORS and standard middlewares
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/health', healthRoutes);

// Socket.IO Setup
const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Register Socket handlers
registerSocketHandlers(io);

// Start server
server.listen(PORT, () => {
  console.log(`[ProxiSpeak Server] Running on http://localhost:${PORT}`);
  console.log(`[ProxiSpeak Server] Allowed CORS origins: ${allowedOrigins.join(', ')}`);
});
