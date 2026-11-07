import { and, count, eq, gt, gte } from "drizzle-orm";
import { db } from "@/db";
import { competitionEntries, competitions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const [competition] = await db.select().from(competitions)
    .where(and(eq(competitions.status, "open"), gte(competitions.startsAt, new Date(0)), gt(competitions.endsAt, now)))
    .orderBy(competitions.endsAt)
    .limit(1);

  if (!competition) return Response.json({ competition: null, approvedEntries: 0, myEntry: null });
  const [total] = await db.select({ value: count() }).from(competitionEntries).where(and(eq(competitionEntries.competitionId, competition.id), eq(competitionEntries.status, "approved")));
  const user = await getCurrentUser();
  let myEntry: { id: string; title: string; status: string; submittedAt: Date } | null = null;
  if (user) {
    const [entry] = await db.select({ id: competitionEntries.id, title: competitionEntries.title, status: competitionEntries.status, submittedAt: competitionEntries.submittedAt })
      .from(competitionEntries)
      .where(and(eq(competitionEntries.competitionId, competition.id), eq(competitionEntries.userId, user.id)))
      .limit(1);
    myEntry = entry ?? null;
  }
  return Response.json({
    competition: {
      id: competition.id,
      slug: competition.slug,
      title: competition.title,
      description: competition.description,
      rules: competition.rules,
      criteria: competition.criteria,
      startsAt: competition.startsAt,
      endsAt: competition.endsAt,
    },
    approvedEntries: total?.value ?? 0,
    myEntry,
  });
}
