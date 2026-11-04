import { Router } from "express";
import { ObjectId } from "mongodb";
import {
  checkPassword,
  hashPassword,
  publicUser,
  requireAuth,
  signToken,
} from "../auth.js";
import { usersCol } from "../db.js";

const router = Router();

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

router.post("/register", async (req, res) => {
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
      createdAt: new Date(),
    });
    const stored = await usersCol().findOne({ _id: result.insertedId });
    res.status(201).json({ token: signToken(result.insertedId), user: publicUser(stored) });
  } catch (err) {
    if (err?.code === 11000) {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Could not create the account." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const problem = validateCredentials(email, password);
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }

    const user = await usersCol().findOne({ email });
    const matches = user ? await checkPassword(password, user.passwordHash) : false;
    if (!user || !matches) {
      res.status(401).json({ error: "Email or password is wrong." });
      return;
    }

    res.json({ token: signToken(user._id), user: publicUser(user) });
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

export default router;

