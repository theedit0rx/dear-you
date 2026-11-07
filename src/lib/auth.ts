import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { sessions, subscriptions, users } from "@/db/schema";
import { SESSION_COOKIE, newOpaqueToken, sessionCookieOptions, sha256 } from "@/lib/security";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "moderator" | "admin";
  status: "active" | "suspended" | "closed";
  isPremium: boolean;
};

export async function startSession(userId: string): Promise<void> {
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId, tokenHash: sha256(token), expiresAt });
  const cookieJar = await cookies();
  cookieJar.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

export async function endSession(): Promise<void> {
  const cookieJar = await cookies();
  const token = cookieJar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  cookieJar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieJar = await cookies();
  const token = cookieJar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      status: users.status,
      subscriptionStatus: subscriptions.status,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || row.status !== "active") return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    isPremium: row.subscriptionStatus === "active" || row.subscriptionStatus === "trialing",
  };
}

export function publicUser(user: CurrentUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isPremium: user.isPremium,
  };
}
