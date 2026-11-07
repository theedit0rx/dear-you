import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { competitionEntries, competitions, users } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin" && auth.user.role !== "moderator") return Response.json({ error: "Moderation access is required." }, { status: 403 });
  const entries = await db.select({ id: competitionEntries.id, title: competitionEntries.title, story: competitionEntries.story, relationship: competitionEntries.relationship, status: competitionEntries.status, moderationNote: competitionEntries.moderationNote, submittedAt: competitionEntries.submittedAt, authorName: users.displayName, competitionTitle: competitions.title })
    .from(competitionEntries)
    .innerJoin(users, eq(competitionEntries.userId, users.id))
    .innerJoin(competitions, eq(competitionEntries.competitionId, competitions.id))
    .orderBy(desc(competitionEntries.submittedAt))
    .limit(100);
  return Response.json({ entries });
}
