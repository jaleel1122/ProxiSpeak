import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import { ALLOWED_ORIGINS, PORT, TRUST_PROXY } from "./config.js";
import { closeDb, connectDb, pingDb } from "./db.js";
import { clearPresence } from "./presence.js";
import { attachRealtime } from "./realtime.js";
import authRoutes from "./routes/auth.js";

const app = express();

// Configure trust proxy based on explicit reverse proxy topology.
// NOTE: Set TRUST_PROXY=1 for single-hop proxies (AWS ALB, Heroku, Render)
// or set TRUST_PROXY=2 for Cloudflare + Nginx. Leave unset if directly exposed.
if (TRUST_PROXY) {
  const hops = Number(TRUST_PROXY);
  if (!Number.isNaN(hops)) {
    app.set("trust proxy", hops);
  } else if (TRUST_PROXY === "true") {
    app.set("trust proxy", true);
  } else {
    app.set("trust proxy", TRUST_PROXY);
  }
}

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

let lastDbCheck = 0;
let cachedDbOk = false;
let dbCheckPromise = null;

async function checkDbReadiness() {
  const now = Date.now();
  // Cache database health status for 5 seconds to protect Atlas from connection pool exhaustion
  if (now - lastDbCheck < 5000) return cachedDbOk;
  if (dbCheckPromise) return dbCheckPromise;

  dbCheckPromise = pingDb()
    .then((ok) => {
      cachedDbOk = ok;
      lastDbCheck = Date.now();
      return ok;
    })
    .finally(() => {
      dbCheckPromise = null;
    });

  return dbCheckPromise;
}

app.get("/health", async (_req, res) => {
  const dbOk = await checkDbReadiness();
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    service: "proxispeak",
  });
});

app.get("/health/live", (_req, res) => {
  res.status(200).json({ ok: true, status: "alive" });
});

app.get("/health/ready", async (_req, res) => {
  const dbOk = await checkDbReadiness();
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    status: dbOk ? "ready" : "unready",
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

