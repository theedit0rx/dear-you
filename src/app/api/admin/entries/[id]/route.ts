import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, competitionEntries } from "@/db/schema";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard, readInput } from "@/lib/http";

const moderationSchema = z.object({ status: z.enum(["approved", "rejected", "needs_review"]), moderationNote: z.string().trim().max(500).default("") });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin" && auth.user.role !== "moderator") return Response.json({ error: "Moderation access is required." }, { status: 403 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return jsonError("Submission not found.", 404);
  const input = await readInput(request, moderationSchema);
  if (input.response) return input.response;
  const [entry] = await db.update(competitionEntries).set({ status: input.data.status, moderationNote: input.data.moderationNote || null, updatedAt: new Date() }).where(eq(competitionEntries.id, id)).returning({ id: competitionEntries.id, status: competitionEntries.status });
  if (!entry) return jsonError("Submission not found.", 404);
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "competition.entry_moderated", targetType: "competition_entry", targetId: id, details: { status: input.data.status } });
  return Response.json({ entry });
}
