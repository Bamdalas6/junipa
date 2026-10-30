import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { SESSION_COOKIE, userFromSession } from "@/lib/auth";
import { isAdmin } from "@/lib/analytics";

export const metadata: Metadata = { title: "Mama · Junipa", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// The owner's dashboard (visitors and payments), only for the emails in ADMIN_EMAILS signed
// in with Google. Everyone else (signed out included) sees the ordinary "page not found".
export default async function MamaPage() {
  const user = await userFromSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!isAdmin(user)) notFound();
  return <AdminDashboard />;
}
