import { count, desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, competitionEntries, reports, subscriptions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const [[userCount], [entryCount], [reportCount], [premiumCount], activity] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(competitionEntries),
    db.select({ value: count() }).from(reports),
    db.select({ value: count() }).from(subscriptions).where((await import("drizzle-orm")).inArray(subscriptions.status, ["active", "trialing"])),
    db.select({ id: auditLogs.id, action: auditLogs.action, targetType: auditLogs.targetType, createdAt: auditLogs.createdAt }).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(12),
  ]);
  return Response.json({ analytics: { users: userCount.value, submissions: entryCount.value, reports: reportCount.value, premiumMembers: premiumCount.value }, recentAudit: activity });
}
