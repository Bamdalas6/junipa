import { db } from "./db";

// Accounts: email + password (PBKDF2) and Google sign-in, with sessions in
// http-only cookies. Only a hash of each session token is stored, so a copy
// of the database can't be used to sign in as anyone.

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  /** Signed up with a password (Google-only accounts have none). */
  hasPassword: boolean;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  google_sub: string | null;
  avatar: string | null;
}

export const SESSION_COOKIE = "junia_session";
const SESSION_DAYS = 30;
// Cloudflare Workers caps PBKDF2 at 100,000 iterations.
const ITERATIONS = 100_000;

const enc = new TextEncoder();
const b64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");
const unb64 = (s: string) => Uint8Array.from(Buffer.from(s, "base64url"));
const randomId = (bytes = 32) => b64(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async (s: string) => b64(await crypto.subtle.digest("SHA-256", enc.encode(s)));

export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const normalEmail = (s: string) => s.trim().toLowerCase();

/* ---------- Passwords ---------- */

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Checked against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY = `pbkdf2$${ITERATIONS}$${b64(new Uint8Array(16))}$${b64(new Uint8Array(32))}`;

export async function verifyPassword(password: string, stored: string | null) {
  const [kind, iter, salt, hash] = (stored ?? DUMMY).split("$");
  if (kind !== "pbkdf2" || !salt || !hash) return false;
  const ok = sameBytes(await pbkdf2(password, unb64(salt), Number(iter)), unb64(hash));
  return ok && stored !== null;
}

/* ---------- Users ---------- */

const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, name: r.name, avatar: r.avatar, hasPassword: !!r.password_hash });

export async function findUserByEmail(email: string) {
  return (await db()).prepare("SELECT * FROM users WHERE email = ?").bind(normalEmail(email)).first<UserRow>();
}

export async function createUser(fields: { email: string; name?: string | null; passwordHash?: string | null; googleSub?: string | null; avatar?: string | null }) {
  const id = randomId(12);
  await (await db())
    .prepare("INSERT INTO users (id, email, name, password_hash, google_sub, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, normalEmail(fields.email), fields.name ?? null, fields.passwordHash ?? null, fields.googleSub ?? null, fields.avatar ?? null, Date.now())
    .run();
  return id;
}

/**
 * Signs in (or up) with a Google account whose email Google has verified.
 * Linking to an existing email account removes that account's password and
 * sessions: Google proved who owns the email, and anyone who registered it
 * first without owning it must not keep a way in.
 */
export async function upsertGoogleUser(g: { sub: string; email: string; name?: string; picture?: string }) {
  const database = await db();
  const bySub = await database.prepare("SELECT * FROM users WHERE google_sub = ?").bind(g.sub).first<UserRow>();
  if (bySub) return bySub.id;
  const byEmail = await findUserByEmail(g.email);
  if (byEmail) {
    await database.batch([
      database.prepare("UPDATE users SET google_sub = ?, password_hash = NULL, avatar = COALESCE(avatar, ?), name = COALESCE(name, ?) WHERE id = ?").bind(g.sub, g.picture ?? null, g.name ?? null, byEmail.id),
      database.prepare("DELETE FROM sessions WHERE user_id = ?").bind(byEmail.id),
    ]);
    return byEmail.id;
  }
  return createUser({ email: g.email, name: g.name, googleSub: g.sub, avatar: g.picture });
}

/* ---------- Forgotten passwords ---------- */

export const RESET_MINUTES = 60;

/** A one-time reset token for the emailed link; earlier unused links for this account stop working. */
export async function createPasswordReset(userId: string) {
  const token = randomId();
  const now = Date.now();
  const database = await db();
  await database.batch([
    database.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(userId),
    database.prepare("INSERT INTO password_resets (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), userId, now + RESET_MINUTES * 60_000, now),
  ]);
  return token;
}

/**
 * Uses up a reset token and sets the new password. Every session on the account
 * ends, so whoever knew the old password is signed out. Returns the user id, or
 * null when the link is unknown, used or expired.
 */
export async function resetPassword(token: string, passwordHash: string) {
  const database = await db();
  const row = await database
    .prepare("DELETE FROM password_resets WHERE id = ? RETURNING user_id, expires_at")
    .bind(await sha256(token))
    .first<{ user_id: string; expires_at: number }>();
  if (!row || row.expires_at <= Date.now()) return null;
  await database.batch([
    database.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, row.user_id),
    database.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id),
    database.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(row.user_id),
  ]);
  return row.user_id;
}

/* ---------- Sessions ---------- */

export async function createSession(userId: string) {
  const token = randomId();
  const now = Date.now();
  await (await db())
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, now + SESSION_DAYS * 86_400_000, now)
    .run();
  return token;
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** The signed-in user for this request, or null. */
export async function currentUser(request: Request): Promise<User | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  try {
    const row = await (await db())
      .prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?")
      .bind(await sha256(token), Date.now())
      .first<UserRow>();
    return row ? toUser(row) : null;
  } catch (e) {
    console.error("[auth] session lookup failed:", (e as Error).message);
    return null;
  }
}

export async function endSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await (await db()).prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
}

const secure = (request: Request) => new URL(request.url).protocol === "https:";

export function sessionCookie(request: Request, token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure(request) ? "; Secure" : ""}`;
}

export function clearCookie(request: Request, name = SESSION_COOKIE) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure(request) ? "; Secure" : ""}`;
}

export { readCookie, randomId, sha256 };

/**
 * State-changing auth requests must come from this site's own pages. Cookies are
 * SameSite=Lax already; this also stops form posts from other sites.
 */
export function fromThisSite(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host || new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/** A path on this site to return to after signing in; anything else becomes "/". */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") && next.length < 500 ? next : "/";
}
