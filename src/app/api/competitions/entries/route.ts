import { and, eq, gt, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, competitionEntries, competitions } from "@/db/schema";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard, readInput } from "@/lib/http";
import { checkRateLimit } from "@/lib/security";

const submissionSchema = z.object({
  competitionId: z.string().uuid(),
  title: z.string().trim().min(3).max(90),
  relationship: z.string().trim().min(2).max(60),
  story: z.string().trim().min(40).max(2400),
  eligibilityAttested: z.literal(true),
});

export async function POST(request: Request) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const limit = await checkRateLimit(request, `competition-entry-${auth.user.id}`, 4, 60 * 60 * 24);
  if (!limit.allowed) return Response.json({ error: "Please wait before trying to submit again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const input = await readInput(request, submissionSchema);
  if (input.response) return input.response;

  const now = new Date();
  const [competition] = await db.select({ id: competitions.id, title: competitions.title }).from(competitions)
    .where(and(eq(competitions.id, input.data.competitionId), eq(competitions.status, "open"), gte(competitions.startsAt, new Date(0)), gt(competitions.endsAt, now)))
    .limit(1);
  if (!competition) return jsonError("This competition is not accepting entries right now.", 409);

  const [entry] = await db.insert(competitionEntries).values({
    competitionId: competition.id,
    userId: auth.user.id,
    title: input.data.title,
    relationship: input.data.relationship,
    story: input.data.story,
    eligibilityAttested: input.data.eligibilityAttested,
    status: "pending",
  }).onConflictDoNothing({ target: [competitionEntries.competitionId, competitionEntries.userId] }).returning({ id: competitionEntries.id, title: competitionEntries.title, status: competitionEntries.status, submittedAt: competitionEntries.submittedAt });

  if (!entry) return jsonError("You’ve already submitted an entry for this competition.", 409);
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "competition.entry_submitted", targetType: "competition_entry", targetId: entry.id, details: { competitionId: competition.id } });
  return Response.json({ entry, note: "Your entry is received and awaiting a human review. Paid features do not affect judging." }, { status: 201 });
}
