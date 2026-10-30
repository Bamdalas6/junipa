import type { Metadata } from "next";
import BillingView from "@/components/BillingView";

export const metadata: Metadata = { title: "Billing · Junipa" };

// Bachs sends subscribers here after checkout (adding ?checkout_id=).
export default function BillingReturnPage() {
  return <BillingView confirming />;
}
