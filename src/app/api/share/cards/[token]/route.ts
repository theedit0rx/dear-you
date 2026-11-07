import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cards } from "@/db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return Response.json({ error: "This note is private or no longer available." }, { status: 404 });
  const [card] = await db
    .select({ id: cards.id, title: cards.title, recipientName: cards.recipientName, message: cards.message, theme: cards.theme, animation: cards.animation, createdAt: cards.createdAt })
    .from(cards)
    .where(and(eq(cards.shareToken, token), eq(cards.published, true)))
    .limit(1);
  if (!card) return Response.json({ error: "This note is private or no longer available." }, { status: 404 });
  return Response.json({ card }, { headers: { "Cache-Control": "private, no-store" } });
}
