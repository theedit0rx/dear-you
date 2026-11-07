import { getCurrentUser, publicUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  return Response.json({ user: user ? publicUser(user) : null });
}
