import type { Metadata } from "next";
import { SharedNote } from "@/components/shared-note";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "A little note for you · Dear You", robots: { index: false, follow: false } };

export default async function SharedCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedNote token={token} kind="card" />;
}
