import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { JWT_SECRET } from "./config.js";
import { usersCol } from "./db.js";

const TOKEN_TTL = "7d";

export function publicUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    color: user.color,
  };
}

export function signToken(userId, tokenVersion = 1) {
  return jwt.sign(
    { sub: String(userId), ver: Number(tokenVersion) || 1 },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL, algorithm: "HS256" }
  );
}

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function checkPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function readBearer(header) {
  const value = header || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

/**
 * Cryptographically verifies token signature and algorithm.
 * Explicitly restricts algorithm to HS256 to prevent algorithm confusion attacks.
 */
export function verifyToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    const id = String(payload.sub || "");
    if (!ObjectId.isValid(id)) return null;
    return {
      userId: id,
      ver: payload.ver !== undefined && payload.ver !== null ? Number(payload.ver) : null,
    };
  } catch {
    return null;
  }
}

export function userIdFromToken(token) {
  const verified = verifyToken(token);
  return verified ? verified.userId : null;
}

export async function requireAuth(req, res, next) {
  const token = readBearer(req.headers.authorization);
  const verified = verifyToken(token);
  if (!verified) {
    res.status(401).json({ error: "Please log in again." });
    return;
  }

  try {
    const user = await usersCol().findOne(
      { _id: new ObjectId(verified.userId) },
      { projection: { tokenVersion: 1 } }
    );
    if (!user) {
      res.status(401).json({ error: "Please log in again." });
      return;
    }

    const currentVersion = user.tokenVersion || 1;
    // Backward-compatible revocation check:
    // If token has version, it must match or exceed user's current version.
    // If token has no version (legacy token), reject only if user version has been bumped (> 1).
    const isRevoked = verified.ver !== null ? verified.ver < currentVersion : currentVersion > 1;
    if (isRevoked) {
      res.status(401).json({ error: "Session has expired or was revoked. Please log in again." });
      return;
    }

    req.userId = verified.userId;
    req.tokenVer = verified.ver;
    next();
  } catch (err) {
    console.error("requireAuth database check failed:", err.message);
    res.status(500).json({ error: "Authentication check failed." });
  }
}

export async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    const verified = verifyToken(typeof token === "string" ? token : "");
    if (!verified) {
      next(new Error("Unauthorized"));
      return;
    }
    const user = await usersCol().findOne({ _id: new ObjectId(verified.userId) });
    if (!user) {
      next(new Error("Unauthorized"));
      return;
    }

    const currentVersion = user.tokenVersion || 1;
    const isRevoked = verified.ver !== null ? verified.ver < currentVersion : currentVersion > 1;
    if (isRevoked) {
      next(new Error("Unauthorized: Session revoked"));
      return;
    }

    socket.user = publicUser(user);
    socket.tokenVer = verified.ver;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
}

