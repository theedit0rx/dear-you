import { desc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  if (auth.user.role !== "admin") return Response.json({ error: "Administrator access is required." }, { status: 403 });
  const rows = await db.select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, status: users.status, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(100);
  return Response.json({ users: rows });
}
