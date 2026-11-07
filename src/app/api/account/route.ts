import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard, readInput } from "@/lib/http";

const updateSchema = z.object({ displayName: z.string().trim().min(2).max(60) });

export async function PATCH(request: Request) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const input = await readInput(request, updateSchema);
  if (input.response) return input.response;

  const [updated] = await db.update(users).set({ displayName: input.data.displayName, updatedAt: new Date() }).where(eq(users.id, auth.user.id)).returning({ id: users.id, email: users.email, displayName: users.displayName });
  if (!updated) return jsonError("Your account could not be updated.", 404);
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "account.profile_updated", targetType: "user", targetId: auth.user.id });
  return Response.json({ user: { ...updated, role: auth.user.role, isPremium: auth.user.isPremium } });
}
