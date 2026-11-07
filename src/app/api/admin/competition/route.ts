import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, competitions } from "@/db/schema";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard, readInput } from "@/lib/http";

export const dynamic = "force-dynamic";

const competitionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1200),
  status: z.enum(["draft", "open", "judging", "closed"]),
  endsAt: z.string().datetime(),
  rules: z.array(z.string().trim().min(5).max(500)).max(12),
  criteria: z.array(z.object({ name: z.string().trim().min(3).max(100), description: z.string().trim().min(5).max(400), weight: z.number().int().min(0).max(100) })).max(8),
}).refine((value) => value.criteria.reduce((sum, criterion) => sum + criterion.weight, 0) === 100, { message: "Judging criteria weights must add up to 100." });

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin") return Response.json({ error: "Administrator access is required." }, { status: 403 });
  const [competition] = await db.select().from(competitions).orderBy(desc(competitions.createdAt)).limit(1);
  return Response.json({ competition: competition ?? null });
}

export async function PATCH(request: Request) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin") return Response.json({ error: "Administrator access is required." }, { status: 403 });
  const input = await readInput(request, competitionSchema);
  if (input.response) return input.response;
  const endsAt = new Date(input.data.endsAt);
  if (endsAt <= new Date()) return jsonError("The deadline must be in the future.", 400);
  const [updated] = await db.update(competitions).set({ title: input.data.title, description: input.data.description, status: input.data.status, endsAt, rules: input.data.rules, criteria: input.data.criteria, updatedAt: new Date() }).where(eq(competitions.id, input.data.id)).returning({ id: competitions.id, title: competitions.title, status: competitions.status, endsAt: competitions.endsAt });
  if (!updated) return jsonError("Competition not found.", 404);
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "admin.competition_updated", targetType: "competition", targetId: updated.id, details: { status: updated.status } });
  return Response.json({ competition: updated });
}
