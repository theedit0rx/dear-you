import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { coinAccounts, coinLedger } from "@/db/schema";
import { requireUser } from "@/lib/http";

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const [account] = await db.select({ balance: coinAccounts.balance }).from(coinAccounts).where(eq(coinAccounts.userId, auth.user.id)).limit(1);
  const transactions = await db.select({ id: coinLedger.id, amount: coinLedger.amount, activityKey: coinLedger.activityKey, description: coinLedger.description, createdAt: coinLedger.createdAt }).from(coinLedger).where(eq(coinLedger.userId, auth.user.id)).orderBy(desc(coinLedger.createdAt)).limit(50);
  return Response.json({
    balance: account?.balance ?? 0,
    transactions,
    earningPolicy: [{ activity: "Your first saved card", coins: 5, limit: "Once per account" }],
  });
}
