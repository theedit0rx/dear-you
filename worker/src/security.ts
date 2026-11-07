import type { AuthUser, D1Database, Env } from "./types";

const encoder = new TextEncoder();
const SESSION_COOKIE = "dearyou_session";
const SESSION_DAYS = 30;

export function responseJson(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...headers },
  });
}

export function corsResponse(request: Request, env: Env, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("vary", "Origin");
  const origin = request.headers.get("origin");
  if (origin && origin === env.APP_ORIGIN) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,PUT,OPTIONS");
    headers.set("access-control-allow-headers", "content-type,stripe-signature");
    headers.set("access-control-max-age", "600");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function sameAppOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === env.APP_ORIGIN);
}

export function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  const prefix = `${name}=`;
  const value = cookies.map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(bytes);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" }, key, 256);
  return `pbkdf2$310000$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsValue, saltValue, digestValue] = stored.split("$");
  const iterations = Number(iterationsValue);
  if (scheme !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 || !saltValue || !digestValue) return false;
  try {
    const salt = fromBase64Url(saltValue);
    const expected = fromBase64Url(digestValue);
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const saltBuffer = new Uint8Array(salt.length);
    saltBuffer.set(salt);
    const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBuffer.buffer, iterations, hash: "SHA-256" }, key, expected.length * 8));
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function sessionCookie(token: string, env: Env, maxAge = SESSION_DAYS * 24 * 60 * 60): string {
  const secure = env.APP_ORIGIN.startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(env: Env): string {
  return sessionCookie("", env, 0);
}

export async function currentUser(request: Request, db: D1Database): Promise<AuthUser | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await db.prepare(`
    SELECT u.id, u.email, u.display_name AS displayName, u.role,
      CASE WHEN sub.status IN ('active','trialing') THEN 1 ELSE 0 END AS isPremium
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN subscriptions sub ON sub.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
    LIMIT 1
  `).bind(tokenHash, Math.floor(Date.now() / 1000)).first<{ id: string; email: string; displayName: string; role: AuthUser["role"]; isPremium: number }>();
  return row ? { ...row, isPremium: row.isPremium === 1 } : null;
}

export async function createSession(db: D1Database, userId: string) {
  const token = newToken();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60;
  await db.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, await sha256(token), expiresAt, now).run();
  return { token, expiresAt };
}

export async function rateLimit(request: Request, db: D1Database, scope: string, maxHits: number, windowSeconds: number) {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const key = await sha256(`${scope}:${ip}`);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;
  await db.prepare(`INSERT INTO rate_limit_buckets(key,hits,window_started_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      hits = CASE WHEN rate_limit_buckets.window_started_at <= ? THEN 1 ELSE rate_limit_buckets.hits + 1 END,
      window_started_at = CASE WHEN rate_limit_buckets.window_started_at <= ? THEN excluded.window_started_at ELSE rate_limit_buckets.window_started_at END`)
    .bind(key, now, windowStart, windowStart).run();
  const bucket = await db.prepare("SELECT hits, window_started_at AS windowStartedAt FROM rate_limit_buckets WHERE key = ?").bind(key).first<{ hits: number; windowStartedAt: number }>();
  const retryAfter = Math.max(1, (bucket?.windowStartedAt ?? now) + windowSeconds - now);
  return { allowed: Boolean(bucket && bucket.hits <= maxHits), retryAfter };
}

export async function readJson(request: Request, maxBytes = 32_000): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function cleanText(value: unknown, maxLength: number, minLength = 0): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (cleaned.length < minLength || cleaned.length > maxLength) return null;
  return cleaned;
}

export async function writeAudit(db: D1Database, actorId: string | null, action: string, targetType: string, targetId: string | null, details: Record<string, string | number | boolean | null> = {}) {
  await db.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), actorId, action, targetType, targetId, JSON.stringify(details), Math.floor(Date.now() / 1000)).run();
}
