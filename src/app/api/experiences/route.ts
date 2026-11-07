import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, experiences } from "@/db/schema";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard, readInput } from "@/lib/http";
import { checkRateLimit, newOpaqueToken } from "@/lib/security";

const experienceSchema = z.object({
  title: z.string().trim().min(2).max(100),
  recipientName: z.string().trim().min(1).max(80),
  memory: z.string().trim().min(10).max(900),
  note: z.string().trim().min(10).max(900),
  reveal: z.string().trim().min(3).max(500),
  theme: z.enum(["petal", "sunset", "keepsake"]).default("petal"),
  published: z.boolean().default(false),
});

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const rows = await db.select({ id: experiences.id, title: experiences.title, recipientName: experiences.recipientName, memory: experiences.memory, note: experiences.note, reveal: experiences.reveal, theme: experiences.theme, published: experiences.published, shareToken: experiences.shareToken, createdAt: experiences.createdAt, updatedAt: experiences.updatedAt }).from(experiences).where(eq(experiences.userId, auth.user.id)).orderBy(desc(experiences.updatedAt));
  return Response.json({ experiences: rows });
}

export async function POST(request: Request) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const limit = await checkRateLimit(request, `experience-create-${auth.user.id}`, 10, 60 * 60 * 24);
  if (!limit.allowed) return Response.json({ error: "You’ve made a lot of experiences today. Please try again tomorrow." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const input = await readInput(request, experienceSchema);
  if (input.response) return input.response;
  if (input.data.theme === "keepsake" && !auth.user.isPremium) return jsonError("The Keepsake experience is part of Premium Studio.", 402);

  const [experience] = await db.insert(experiences).values({ ...input.data, userId: auth.user.id, shareToken: input.data.published ? newOpaqueToken() : null }).returning({
    id: experiences.id,
    title: experiences.title,
    recipientName: experiences.recipientName,
    memory: experiences.memory,
    note: experiences.note,
    reveal: experiences.reveal,
    theme: experiences.theme,
    published: experiences.published,
    shareToken: experiences.shareToken,
    createdAt: experiences.createdAt,
    updatedAt: experiences.updatedAt,
  });
  await db.insert(auditLogs).values({ actorId: auth.user.id, action: "experience.created", targetType: "experience", targetId: experience.id, details: { published: experience.published } });
  return Response.json({ experience }, { status: 201 });
}
