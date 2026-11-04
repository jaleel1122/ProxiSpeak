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

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: TOKEN_TTL });
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

export function userIdFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const id = String(payload.sub || "");
    if (!ObjectId.isValid(id)) return null;
    return id;
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const userId = userIdFromToken(readBearer(req.headers.authorization));
  if (!userId) {
    res.status(401).json({ error: "Please log in again." });
    return;
  }
  req.userId = userId;
  next();
}

export async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    const userId = userIdFromToken(typeof token === "string" ? token : "");
    if (!userId) {
      next(new Error("Unauthorized"));
      return;
    }
    const user = await usersCol().findOne({ _id: new ObjectId(userId) });
    if (!user) {
      next(new Error("Unauthorized"));
      return;
    }
    socket.user = publicUser(user);
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
}

