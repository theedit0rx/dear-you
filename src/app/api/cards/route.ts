import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, cards, coinAccounts, coinLedger, mediaAssets } from "@/db/schema";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard, readInput } from "@/lib/http";
import { checkRateLimit, newOpaqueToken } from "@/lib/security";
import { rewardForActivity } from "@/lib/coin-rules";

const cardSchema = z.object({
  title: z.string().trim().min(2).max(100),
  recipientName: z.string().trim().max(80).default(""),
  message: z.string().trim().min(1).max(1800),
  theme: z.enum(["letter", "petal", "botanical", "night-sky"]).default("letter"),
  animation: z.enum(["fade", "float", "sparkle"]).default("fade"),
  mediaId: z.string().uuid().nullable().optional(),
  published: z.boolean().default(false),
});
const premiumThemes = new Set(["botanical", "night-sky"]);

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const rows = await db
    .select({ id: cards.id, title: cards.title, recipientName: cards.recipientName, message: cards.message, theme: cards.theme, animation: cards.animation, mediaId: cards.mediaId, published: cards.published, shareToken: cards.shareToken, createdAt: cards.createdAt, updatedAt: cards.updatedAt })
    .from(cards)
    .where(eq(cards.userId, auth.user.id))
    .orderBy(desc(cards.updatedAt));
  return Response.json({ cards: rows });
}

export async function POST(request: Request) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const limit = await checkRateLimit(request, `card-create-${auth.user.id}`, 20, 60 * 60 * 24);
  if (!limit.allowed) return Response.json({ error: "You’ve made a lot of cards today. Please try again tomorrow." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const input = await readInput(request, cardSchema);
  if (input.response) return input.response;
  if (!auth.user.isPremium && (premiumThemes.has(input.data.theme) || input.data.animation === "sparkle")) {
    return jsonError("That studio treatment is part of Premium Studio. Choose a free style or explore Premium.", 402);
  }

  if (input.data.mediaId) {
    const [owned] = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(eq(mediaAssets.id, input.data.mediaId), eq(mediaAssets.userId, auth.user.id))).limit(1);
    if (!owned) return jsonError("That image doesn't belong to your account.", 403);
  }

  const shareToken = input.data.published ? newOpaqueToken() : null;
  const result = await db.transaction(async (tx) => {
    const [card] = await tx.insert(cards).values({ ...input.data, userId: auth.user.id, shareToken }).returning({
      id: cards.id,
      title: cards.title,
      recipientName: cards.recipientName,
      message: cards.message,
      theme: cards.theme,
      animation: cards.animation,
      published: cards.published,
      shareToken: cards.shareToken,
      createdAt: cards.createdAt,
      updatedAt: cards.updatedAt,
    });
    const [existingReward] = await tx.select({ id: coinLedger.id }).from(coinLedger).where(and(eq(coinLedger.userId, auth.user.id), eq(coinLedger.activityKey, "first-card"))).limit(1);
    const reward = rewardForActivity("first-card", Boolean(existingReward));
    if (reward > 0) {
      const [account] = await tx.select().from(coinAccounts).where(eq(coinAccounts.userId, auth.user.id)).for("update");
      if (account) {
        await tx.update(coinAccounts).set({ balance: sql`${coinAccounts.balance} + ${reward}`, updatedAt: new Date() }).where(eq(coinAccounts.userId, auth.user.id));
      } else {
        await tx.insert(coinAccounts).values({ userId: auth.user.id, balance: reward });
      }
      await tx.insert(coinLedger).values({ userId: auth.user.id, amount: reward, activityKey: "first-card", description: "Your first little note is on its way" });
    }
    await tx.insert(auditLogs).values({ actorId: auth.user.id, action: "card.created", targetType: "card", targetId: card.id, details: { published: card.published } });
    return { card, reward };
  });

  return Response.json({ card: result.card, coinReward: result.reward }, { status: 201 });
}
