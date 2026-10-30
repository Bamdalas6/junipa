import type { Metadata } from "next";
import ResetPasswordView from "@/components/ResetPasswordView";

// The link's token is in the address: don't pass it on to other sites or search engines.
export const metadata: Metadata = { title: "Reset password · Junipa", referrer: "no-referrer", robots: { index: false } };

// Opened from the emailed link (?token=...).
export default function ResetPasswordPage() {
  return <ResetPasswordView />;
}
