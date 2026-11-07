import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { rateLimitBuckets } from "@/db/schema";
import { sql } from "drizzle-orm";

export const SESSION_COOKIE = "dearyou_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newOpaqueToken(): string {
  return randomBytes(24).toString("base64url");
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key)));
  });
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, digest] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !digest || !/^[a-f0-9]{128}$/i.test(digest)) return false;
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key)));
  });
  const expected = Buffer.from(digest, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function checkRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const forwardedFor = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const ip = forwardedFor.split(",")[0].trim().slice(0, 120);
  const key = sha256(`${scope}:${ip}`).slice(0, 64);
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowSeconds * 1000);
  const [bucket] = await db
    .insert(rateLimitBuckets)
    .values({ key, hits: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        hits: sql`CASE WHEN ${rateLimitBuckets.windowStartedAt} <= ${cutoff} THEN 1 ELSE ${rateLimitBuckets.hits} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${rateLimitBuckets.windowStartedAt} <= ${cutoff} THEN ${now} ELSE ${rateLimitBuckets.windowStartedAt} END`,
      },
    })
    .returning({ hits: rateLimitBuckets.hits, windowStartedAt: rateLimitBuckets.windowStartedAt });

  const retryAfter = Math.max(1, Math.ceil((bucket.windowStartedAt.getTime() + windowSeconds * 1000 - now.getTime()) / 1000));
  return { allowed: bucket.hits <= limit, retryAfter };
}
