import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import { ALLOWED_ORIGINS, PORT } from "./config.js";
import { closeDb, connectDb, pingDb } from "./db.js";
import { playerCount } from "./players.js";
import { clearPresence } from "./presence.js";
import { attachRealtime } from "./realtime.js";
import authRoutes from "./routes/auth.js";

const app = express();

// Disable X-Powered-By to prevent framework fingerprinting
app.disable("x-powered-by");

// Apply Helmet security headers.
// Note: Express exclusively serves JSON API endpoints; the React frontend is hosted separately.
// We configure Helmet with contentSecurityPolicy: false on the API server to avoid unnecessary
// header overhead on JSON payloads. CSP must be configured at the frontend hosting layer
// (e.g. Netlify/Vercel/Nginx) permitting WebSocket (ws/wss), API, and WebRTC STUN connections.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: "64kb" }));

app.get("/health", async (_req, res) => {
  const dbOk = await pingDb();
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    service: "proxispeak",
    players: playerCount(),
  });
});

app.use("/api/auth", authRoutes);

app.use((err, _req, res, next) => {
  if (err?.type === "entity.parse.failed" || (err instanceof SyntaxError && err.status === 400)) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }
  next(err);
});

const httpServer = createServer(app);
attachRealtime(httpServer);

async function main() {
  await connectDb();
  await clearPresence();
  httpServer.listen(PORT, () => {
    console.log(`ProxiSpeak server on http://localhost:${PORT}`);
  });
}

async function shutdown() {
  httpServer.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

