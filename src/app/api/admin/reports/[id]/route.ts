import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, reports } from "@/db/schema";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard, readInput } from "@/lib/http";

const reportStatusSchema = z.object({ status: z.enum(["reviewing", "resolved", "dismissed"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin" && auth.user.role !== "moderator") return Response.json({ error: "Moderation access is required." }, { status: 403 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return jsonError("Report not found.", 404);
  const input = await readInput(request, reportStatusSchema);
  if (input.response) return input.response;
  const [updated] = await db.update(reports).set({ status: input.data.status }).where(eq(reports.id, id)).returning({ id: reports.id, status: reports.status });
  if (!updated) return jsonError("Report not found.", 404);
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "moderation.report_updated", targetType: "report", targetId: id, details: { status: input.data.status } });
  return Response.json({ report: updated });
}
