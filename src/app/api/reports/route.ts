import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, cards, competitionEntries, experiences, reports } from "@/db/schema";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard, readInput } from "@/lib/http";
import { checkRateLimit } from "@/lib/security";

const reportSchema = z.object({
  targetType: z.enum(["card", "experience", "entry"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(8).max(500),
});

export async function POST(request: Request) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const limit = await checkRateLimit(request, `report-${auth.user.id}`, 8, 60 * 60 * 24);
  if (!limit.allowed) return Response.json({ error: "Please wait before sending another report." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const input = await readInput(request, reportSchema);
  if (input.response) return input.response;

  let found = false;
  if (input.data.targetType === "card") {
    const [row] = await db.select({ id: cards.id }).from(cards).where(and(eq(cards.id, input.data.targetId), eq(cards.published, true))).limit(1);
    found = Boolean(row);
  } else if (input.data.targetType === "experience") {
    const [row] = await db.select({ id: experiences.id }).from(experiences).where(and(eq(experiences.id, input.data.targetId), eq(experiences.published, true))).limit(1);
    found = Boolean(row);
  } else {
    const [row] = await db.select({ id: competitionEntries.id }).from(competitionEntries).where(and(eq(competitionEntries.id, input.data.targetId), eq(competitionEntries.status, "approved"))).limit(1);
    found = Boolean(row);
  }
  if (!found) return jsonError("That shared item could not be found.", 404);

  const [report] = await db.insert(reports).values({ reporterId: auth.user.id, targetType: input.data.targetType, targetId: input.data.targetId, reason: input.data.reason }).returning({ id: reports.id });
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "content.reported", targetType: input.data.targetType, targetId: input.data.targetId, details: { reportId: report.id } });
  return Response.json({ ok: true, message: "Thank you. Our moderation team will review this report." }, { status: 201 });
}
