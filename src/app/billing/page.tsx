import type { Metadata } from "next";
import BillingView from "@/components/BillingView";

export const metadata: Metadata = { title: "Billing · Junia" };

export default function BillingPage() {
  return <BillingView />;
}
