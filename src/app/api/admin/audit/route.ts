import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requireUser } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin") return Response.json({ error: "Administrator access is required." }, { status: 403 });
  const events = await db.select({ id: auditLogs.id, action: auditLogs.action, targetType: auditLogs.targetType, targetId: auditLogs.targetId, details: auditLogs.details, createdAt: auditLogs.createdAt, actorName: users.displayName })
    .from(auditLogs).leftJoin(users, (await import("drizzle-orm")).eq(auditLogs.actorId, users.id)).orderBy(desc(auditLogs.createdAt)).limit(100);
  return Response.json({ events });
}
