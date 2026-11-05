import { Router } from "express";
import rateLimit from "express-rate-limit";
import { ObjectId } from "mongodb";
import {
  checkPassword,
  hashPassword,
  publicUser,
  requireAuth,
  signToken,
} from "../auth.js";
import { usersCol } from "../db.js";
import { revokeUserSockets } from "../realtime.js";

const router = Router();

// Constant-time dummy hash used when an email is not registered.
// Prevents timing-based user enumeration attacks by equalizing bcrypt execution time.
const DUMMY_HASH = "$2a$10$7EqJtq98hPqEX7fNZaOD..8wX7HkR5V2w7aE4xU4oUuR7Yw7Ld2Wy";

/**
 * In-memory rate limiters for authentication endpoints.
 * NOTE: For horizontally scaled production instances across multiple Node.js processes,
 * an external distributed store (such as rate-limit-redis) must be used so rate limit
 * counters are shared across all backend nodes.
 *
 * NOTE ON REVERSE PROXIES:
 * When running behind a reverse proxy (e.g., Cloudflare, AWS ALB, Nginx), Express must
 * be configured with `app.set("trust proxy", <hops>)` for `req.ip` to reflect the client IP.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 account registrations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many accounts created from this IP. Please try again later." },
});

const COLORS = [
  "#d4533e",
  "#d9892b",
  "#2f9e6b",
  "#1f8a96",
  "#3b6fd8",
  "#7a5af0",
  "#d4537e",
  "#0f8f78",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateCredentials(email, password, { requireName, displayName } = {}) {
  if (!EMAIL_RE.test(email) || email.length > 254) return "Enter a valid email.";
  if (password.length < 8 || password.length > 72) {
    return "Use a password between 8 and 72 characters.";
  }
  if (requireName) {
    const name = String(displayName || "").trim();
    if (name.length < 2 || name.length > 24) {
      return "Display name should be 2–24 characters.";
    }
  }
  return "";
}

router.post("/register", registerLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const displayName = String(req.body?.displayName || "").trim();
    const problem = validateCredentials(email, password, { requireName: true, displayName });
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }

    const passwordHash = await hashPassword(password);
    const result = await usersCol().insertOne({
      email,
      passwordHash,
      displayName,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      tokenVersion: 1,
      createdAt: new Date(),
    });
    const stored = await usersCol().findOne({ _id: result.insertedId });
    res.status(201).json({ token: signToken(result.insertedId, 1), user: publicUser(stored) });
  } catch (err) {
    if (err?.code === 11000) {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Could not create the account." });
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const problem = validateCredentials(email, password);
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }

    const user = await usersCol().findOne({ email });
    // Constant-time comparison: execute bcrypt even when email does not exist
    // to prevent timing-based user enumeration attacks.
    const hashToCompare = user?.passwordHash || DUMMY_HASH;
    const matches = await checkPassword(password, hashToCompare);
    if (!user || !matches) {
      res.status(401).json({ error: "Email or password is wrong." });
      return;
    }

    const tokenVersion = user.tokenVersion || 1;
    res.json({ token: signToken(user._id, tokenVersion), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not sign you in." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await usersCol().findOne({ _id: new ObjectId(req.userId) });
  if (!user) {
    res.status(401).json({ error: "Please log in again." });
    return;
  }
  res.json({ user: publicUser(user) });
});

router.post("/logout", requireAuth, async (req, res) => {
  try {
    // Invalidate all existing tokens for this user by bumping tokenVersion
    await usersCol().updateOne(
      { _id: new ObjectId(req.userId) },
      { $inc: { tokenVersion: 1 } }
    );
    // Forcefully disconnect and clean up active socket connections
    revokeUserSockets(req.userId);
    res.json({ ok: true, message: "Logged out successfully." });
  } catch (err) {
    console.error("Logout failed:", err.message);
    res.status(500).json({ error: "Could not log out." });
  }
});

export default router;

