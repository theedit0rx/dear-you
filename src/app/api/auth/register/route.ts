import { z } from "zod";
import { db } from "@/db";
import { auditLogs, coinAccounts, users } from "@/db/schema";
import { startSession } from "@/lib/auth";
import { jsonError, mutationGuard, readInput } from "@/lib/http";
import { checkRateLimit, hashPassword } from "@/lib/security";

const registerSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(2).max(60),
  password: z.string().min(10).max(128),
});

export async function POST(request: Request) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const limit = await checkRateLimit(request, "auth-register", 8, 60 * 60);
  if (!limit.allowed) return Response.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const input = await readInput(request, registerSchema);
  if (input.response) return input.response;
  const passwordHash = await hashPassword(input.data.password);

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: input.data.email, displayName: input.data.displayName, passwordHash })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email, displayName: users.displayName });
    if (!user) return null;
    await tx.insert(coinAccounts).values({ userId: user.id, balance: 0 });
    await tx.insert(auditLogs).values({ actorId: user.id, action: "account.created", targetType: "user", targetId: user.id });
    return user;
  });

  if (!created) return jsonError("An account with this email already exists.", 409);
  await startSession(created.id);
  return Response.json({ user: { ...created, role: "user", isPremium: false } }, { status: 201 });
}
