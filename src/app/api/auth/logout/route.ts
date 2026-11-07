import { endSession } from "@/lib/auth";
import { mutationGuard } from "@/lib/http";

export async function POST(request: Request) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  await endSession();
  return Response.json({ ok: true });
}
