import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reports, users } from "@/db/schema";
import { requireUser } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin" && auth.user.role !== "moderator") return Response.json({ error: "Moderation access is required." }, { status: 403 });
  const rows = await db.select({ id: reports.id, targetType: reports.targetType, targetId: reports.targetId, reason: reports.reason, status: reports.status, createdAt: reports.createdAt, reporterName: users.displayName })
    .from(reports).innerJoin(users, eq(reports.reporterId, users.id)).orderBy(desc(reports.createdAt)).limit(100);
  return Response.json({ reports: rows });
}
