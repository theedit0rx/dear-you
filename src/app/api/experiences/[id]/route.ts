import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, experiences } from "@/db/schema";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard, readInput } from "@/lib/http";
import { newOpaqueToken } from "@/lib/security";

const updateSchema = z.object({
  title: z.string().trim().min(2).max(100),
  recipientName: z.string().trim().min(1).max(80),
  memory: z.string().trim().min(10).max(900),
  note: z.string().trim().min(10).max(900),
  reveal: z.string().trim().min(3).max(500),
  theme: z.enum(["petal", "sunset", "keepsake"]).default("petal"),
  published: z.boolean().default(false),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return jsonError("This experience could not be found.", 404);
  const input = await readInput(request, updateSchema);
  if (input.response) return input.response;
  if (input.data.theme === "keepsake" && !auth.user.isPremium) return jsonError("The Keepsake experience is part of Premium Studio.", 402);
  const [current] = await db.select().from(experiences).where(and(eq(experiences.id, id), eq(experiences.userId, auth.user.id))).limit(1);
  if (!current) return jsonError("This experience could not be found.", 404);
  const [experience] = await db.update(experiences).set({ ...input.data, shareToken: input.data.published ? current.shareToken ?? newOpaqueToken() : null, updatedAt: new Date() }).where(and(eq(experiences.id, id), eq(experiences.userId, auth.user.id))).returning({ id: experiences.id, title: experiences.title, recipientName: experiences.recipientName, memory: experiences.memory, note: experiences.note, reveal: experiences.reveal, theme: experiences.theme, published: experiences.published, shareToken: experiences.shareToken, createdAt: experiences.createdAt, updatedAt: experiences.updatedAt });
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "experience.updated", targetType: "experience", targetId: experience.id, details: { published: experience.published } });
  return Response.json({ experience });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return jsonError("This experience could not be found.", 404);
  const [deleted] = await db.delete(experiences).where(and(eq(experiences.id, id), eq(experiences.userId, auth.user.id))).returning({ id: experiences.id });
  if (!deleted) return jsonError("This experience could not be found.", 404);
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "experience.deleted", targetType: "experience", targetId: id });
  return Response.json({ ok: true });
}
