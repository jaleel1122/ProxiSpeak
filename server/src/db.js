import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { MongoClient } from "mongodb";
import { MONGODB_DB, MONGODB_URI } from "./config.js";

let client;
let database;

function srvLookupFailed(err) {
  const text = `${err?.code || ""} ${err?.message || ""} ${err?.cause?.code || ""} ${err?.cause?.message || ""}`;
  return text.includes("querySrv") && /ECONNREFUSED|ETIMEOUT|ESERVFAIL/.test(text);
}

async function openClient() {
  const next = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await next.connect();
  await next.db("admin").command({ ping: 1 });
  client = next;
  database = next.db(MONGODB_DB);
}

async function prepareDns() {
  if (!MONGODB_URI.startsWith("mongodb+srv://")) return;
  const host = MONGODB_URI.split("@")[1]?.split("/")[0]?.split("?")[0];
  if (!host) return;
  try {
    await dnsPromises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch (err) {
    // Some Windows DNS resolvers refuse SRV lookups. Atlas connection strings need one.
    if (!srvLookupFailed(err) && err?.code !== "ECONNREFUSED") return;
    dns.setServers(["1.1.1.1", "8.8.8.8"]);
  }
}

export async function connectDb() {
  await prepareDns();
  await openClient();

  const users = database.collection("users");
  const presence = database.collection("presence");
  await users.createIndex({ email: 1 }, { unique: true });
  await presence.createIndex({ userId: 1 }, { unique: true });
  await presence.createIndex({ location: "2dsphere" });
  return database;
}

export function db() {
  if (!database) throw new Error("Database is not connected.");
  return database;
}

export function usersCol() {
  return db().collection("users");
}

export function presenceCol() {
  return db().collection("presence");
}

export async function pingDb() {
  try {
    await db().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeDb() {
  await client?.close();
  client = null;
  database = null;
}

