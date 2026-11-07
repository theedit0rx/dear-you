import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, cards, mediaAssets } from "@/db/schema";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard, readInput } from "@/lib/http";
import { newOpaqueToken } from "@/lib/security";

const updateSchema = z.object({
  title: z.string().trim().min(2).max(100),
  recipientName: z.string().trim().max(80).default(""),
  message: z.string().trim().min(1).max(1800),
  theme: z.enum(["letter", "petal", "botanical", "night-sky"]).default("letter"),
  animation: z.enum(["fade", "float", "sparkle"]).default("fade"),
  mediaId: z.string().uuid().nullable().optional(),
  published: z.boolean().default(false),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return jsonError("This card could not be found.", 404);
  const input = await readInput(request, updateSchema);
  if (input.response) return input.response;
  if (!auth.user.isPremium && (["botanical", "night-sky"].includes(input.data.theme) || input.data.animation === "sparkle")) return jsonError("That studio treatment is part of Premium Studio.", 402);

  if (input.data.mediaId) {
    const [owned] = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(eq(mediaAssets.id, input.data.mediaId), eq(mediaAssets.userId, auth.user.id))).limit(1);
    if (!owned) return jsonError("That image doesn't belong to your account.", 403);
  }

  const [current] = await db.select().from(cards).where(and(eq(cards.id, id), eq(cards.userId, auth.user.id))).limit(1);
  if (!current) return jsonError("This card could not be found.", 404);
  const shareToken = input.data.published ? current.shareToken ?? newOpaqueToken() : null;
  const [card] = await db.update(cards).set({ ...input.data, shareToken, updatedAt: new Date() }).where(and(eq(cards.id, id), eq(cards.userId, auth.user.id))).returning({
    id: cards.id,
    title: cards.title,
    recipientName: cards.recipientName,
    message: cards.message,
    theme: cards.theme,
    animation: cards.animation,
    mediaId: cards.mediaId,
    published: cards.published,
    shareToken: cards.shareToken,
    createdAt: cards.createdAt,
    updatedAt: cards.updatedAt,
  });
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "card.updated", targetType: "card", targetId: card.id, details: { published: card.published } });
  return Response.json({ card });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return jsonError("This card could not be found.", 404);
  const [deleted] = await db.delete(cards).where(and(eq(cards.id, id), eq(cards.userId, auth.user.id))).returning({ id: cards.id });
  if (!deleted) return jsonError("This card could not be found.", 404);
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "card.deleted", targetType: "card", targetId: deleted.id });
  return Response.json({ ok: true });
}
