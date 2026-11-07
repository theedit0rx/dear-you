import Stripe from "stripe";
import { requireUser } from "@/lib/http";
import { jsonError, mutationGuard } from "@/lib/http";
import { checkRateLimit } from "@/lib/security";

export async function POST(request: Request) {
  const csrf = mutationGuard(request);
  if (csrf) return csrf;
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const limit = await checkRateLimit(request, `checkout-${auth.user.id}`, 4, 60 * 60);
  if (!limit.allowed) return Response.json({ error: "Please wait before starting another checkout." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!secret || !secret.startsWith("sk_test_") || !priceId) {
    return Response.json({ error: "Premium checkout is not configured yet. No payment has been taken." }, { status: 503 });
  }

  try {
    const stripe = new Stripe(secret);
    const origin = new URL(request.url).origin;
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: auth.user.id,
      customer_email: auth.user.email,
      metadata: { userId: auth.user.id, product: "dear-you-premium" },
      subscription_data: { metadata: { userId: auth.user.id, product: "dear-you-premium" } },
      success_url: `${origin}/?purchase=confirmation`,
      cancel_url: `${origin}/?purchase=cancelled`,
      allow_promotion_codes: false,
    });
    if (!checkout.url) return jsonError("Checkout could not be started. Please try again later.", 502);
    return Response.json({ url: checkout.url });
  } catch {
    return jsonError("The payment provider could not start checkout. No membership change was made.", 502);
  }
}
