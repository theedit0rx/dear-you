import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, sessions, users } from "@/db/schema";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard, readInput } from "@/lib/http";

const statusSchema = z.object({ status: z.enum(["active", "suspended", "closed"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin") return Response.json({ error: "Administrator access is required." }, { status: 403 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success || id === auth.user.id) return jsonError("This account could not be updated.", 400);
  const input = await readInput(request, statusSchema);
  if (input.response) return input.response;
  const [updated] = await db.update(users).set({ status: input.data.status, updatedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id, status: users.status });
  if (!updated) return jsonError("This account could not be found.", 404);
  if (input.data.status !== "active") await db.delete(sessions).where(eq(sessions.userId, id));
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "admin.user_status_changed", targetType: "user", targetId: id, details: { status: input.data.status } });
  return Response.json({ user: updated });
}
