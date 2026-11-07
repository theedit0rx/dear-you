import type { ZodType } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/security";

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function readInput<T>(request: Request, schema: ZodType<T>): Promise<{ data: T; response?: never } | { data?: never; response: Response }> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { response: jsonError(parsed.error.issues[0]?.message ?? "Please check your details and try again.", 400) };
  return { data: parsed.data };
}

export function mutationGuard(request: Request): Response | null {
  if (!sameOrigin(request)) return jsonError("This request could not be verified. Refresh and try again.", 403);
  return null;
}

export async function requireUser(): Promise<{ user: CurrentUser; response?: never } | { user?: never; response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { response: jsonError("Sign in to continue.", 401) };
  return { user };
}

export async function requireAdmin(): Promise<{ user: CurrentUser; response?: never } | { user?: never; response: Response }> {
  const result = await requireUser();
  if (result.response) return result;
  if (result.user.role !== "admin" && result.user.role !== "moderator") {
    return { response: jsonError("You are not authorized to perform this action.", 403) };
  }
  return result;
}
