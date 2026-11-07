import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, subscriptions } from "@/db/schema";

export const dynamic = "force-dynamic";

async function syncSubscription(subscription: Stripe.Subscription, hintedUserId?: string | null) {
  const [existing] = await db.select({ userId: subscriptions.userId }).from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, subscription.id)).limit(1);
  const userId = hintedUserId ?? existing?.userId;
  if (!userId) return;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const periodEnd = subscription.items.data[0]?.current_period_end;
  const currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;
  await db.insert(subscriptions).values({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    status: subscription.status,
    currentPeriodEnd,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: subscriptions.userId,
    set: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      status: subscription.status,
      currentPeriodEnd,
      updatedAt: new Date(),
    },
  });
  await db.insert(auditLogs).values({ actorId: userId, action: "billing.subscription_synced", targetType: "subscription", targetId: subscription.id, details: { status: subscription.status } });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !secret.startsWith("sk_test_") || !webhookSecret || !signature) return Response.json({ error: "Webhook verification is not configured." }, { status: 503 });

  const body = await request.text();
  const stripe = new Stripe(secret);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(subscription, session.client_reference_id ?? session.metadata?.userId ?? null);
      }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncSubscription(event.data.object as Stripe.Subscription);
    }
    return Response.json({ received: true });
  } catch {
    return Response.json({ error: "The verified event could not be recorded. Please retry delivery." }, { status: 500 });
  }
}
