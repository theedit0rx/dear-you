import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { experiences } from "@/db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return Response.json({ error: "This experience is private or no longer available." }, { status: 404 });
  const [experience] = await db.select({ id: experiences.id, title: experiences.title, recipientName: experiences.recipientName, memory: experiences.memory, note: experiences.note, reveal: experiences.reveal, theme: experiences.theme }).from(experiences).where(and(eq(experiences.shareToken, token), eq(experiences.published, true))).limit(1);
  if (!experience) return Response.json({ error: "This experience is private or no longer available." }, { status: 404 });
  return Response.json({ experience }, { headers: { "Cache-Control": "private, no-store" } });
}
