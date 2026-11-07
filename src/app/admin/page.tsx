import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administration" };

export default function AdminPage() {
  return <AdminDashboard />;
}
