import { FREE_LEADS } from "./leads-shared";

/** Prospect accounts a campaign can hold (the research finds 10-12; the API accepts up to this). */
export const MAX_ACCOUNTS = 25;

// Subscription plans, shared by the pricing page and the server.
// Prices shown here come from REACHLY_PRICE_* and must match the recurring products
// in Bachs (BACHS_PRODUCT_*), which are what actually gets charged.

export type PlanId = "starter" | "pro";
export type Interval = "monthly" | "yearly";
export type Entitled = PlanId | "free";

export interface Plan {
  id: PlanId;
  name: string;
  monthly: number;
  yearly: number;
  blurb: string;
  features: string[];
  /** Decision makers per campaign. */
  accounts: number;
  peoplePerAccount: number;
  verifiedEmails: boolean;
  /** Pipeline size; null = unlimited. */
  leads: number | null;
  followUps: boolean;
  highlight?: boolean;
}

export const PLAN_LIST = (prices?: Partial<Record<`${PlanId}_${Interval}`, number>>): Plan[] => [
  {
    id: "starter",
    name: "Starter",
    monthly: prices?.starter_monthly ?? 19,
    yearly: prices?.starter_yearly ?? 209,
    blurb: "Find and reach the right buyers",
    features: [
      "Research workspace for your brand",
      "Buyer and channel research",
      "Decision makers for every prospect, on every campaign",
      "Outreach drafts for DM, email and WhatsApp",
      "Pipeline for up to 25 leads",
      "Launch kit (coming soon)",
    ],
    // Any subscription unlocks every decision maker: all of a campaign's prospects, up to 2 people each.
    accounts: MAX_ACCOUNTS,
    peoplePerAccount: 2,
    verifiedEmails: false,
    leads: FREE_LEADS,
    followUps: false,
  },
  {
    id: "pro",
    name: "Pro",
    monthly: prices?.pro_monthly ?? 49,
    yearly: prices?.pro_yearly ?? 539,
    blurb: "Turn replies into customers",
    features: [
      "Everything in Starter",
      "Verified work emails where available",
      "Results tracking: unlimited pipeline",
      "Automatic follow-ups, drafted by Scout",
    ],
    accounts: MAX_ACCOUNTS,
    peoplePerAccount: 2,
    verifiedEmails: true,
    leads: null,
    followUps: true,
    highlight: true,
  },
];

export { FREE_LEADS };

export const isPlan = (v: unknown): v is PlanId => v === "starter" || v === "pro";
export const isInterval = (v: unknown): v is Interval => v === "monthly" || v === "yearly";

export interface BillingStatus {
  /** Subscriptions can be bought (payments and all four products are set up). */
  enabled: boolean;
  plan: Entitled;
  interval: Interval | null;
  status: string | null;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  plans: Plan[];
}
