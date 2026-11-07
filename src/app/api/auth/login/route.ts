import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { startSession } from "@/lib/auth";
import { jsonError, mutationGuard, readInput } from "@/lib/http";
import { checkRateLimit, verifyPassword } from "@/lib/security";

const loginSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const limit = await checkRateLimit(request, "auth-login", 10, 15 * 60);
  if (!limit.allowed) return Response.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const input = await readInput(request, loginSchema);
  if (input.response) return input.response;
  const [user] = await db.select().from(users).where(eq(users.email, input.data.email)).limit(1);
  if (!user || !(await verifyPassword(input.data.password, user.passwordHash))) return jsonError("Email or password is incorrect.", 401);
  if (user.status !== "active") return jsonError("This account is currently unavailable. Contact support for help.", 403);

  await startSession(user.id);
  await db.insert(auditLogs).values({ actorId: user.id, action: "account.signed_in", targetType: "user", targetId: user.id });
  const [membership] = await db.select({ status: (await import("@/db/schema")).subscriptions.status }).from((await import("@/db/schema")).subscriptions).where(eq((await import("@/db/schema")).subscriptions.userId, user.id)).limit(1);
  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isPremium: membership?.status === "active" || membership?.status === "trialing",
    },
  });
}
