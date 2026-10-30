import type { Metadata } from "next";
import { LEGAL, LegalPage, Ul, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service · Junipa",
  description: "The terms for using Junipa: accounts, subscriptions, acceptable use, research output and liability.",
};

const mail = (
  <a href={`mailto:${LEGAL.email}`} className="text-accent hover:underline">
    {LEGAL.email}
  </a>
);

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "The agreement",
    body: (
      <>
        <p>
          These terms are an agreement between you and {LEGAL.operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;), which operates {LEGAL.product} at {LEGAL.site} (the
          &ldquo;service&rdquo;). By creating an account or using the service, you accept these terms and our <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>.
        </p>
        <p>If you use Junipa for a company or other organisation, you accept these terms on its behalf and confirm you have authority to do so; &ldquo;you&rdquo; then means that organisation.</p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Who can use Junipa",
    body: <p>Junipa is a business tool. You must be at least 18 and use it for business or professional purposes. You may not use it if the law prohibits you from doing so.</p>,
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <Ul>
        <li>Give accurate information and keep it up to date.</li>
        <li>Keep your password safe. You are responsible for what happens in your account; tell us at once if you think someone else has used it.</li>
        <li>Accounts are for one person. Don&apos;t share your sign-in or resell access.</li>
      </Ul>
    ),
  },
  {
    id: "service",
    title: "What Junipa does",
    body: (
      <>
        <p>
          Junipa researches a business and its market, suggests audiences, finds prospect businesses and the people who decide at them from public sources, drafts
          outreach messages, and (on Pro) tracks results and reminds you when follow-ups are due.
        </p>
        <p>
          <strong className="text-ink">Junipa does not send messages for you.</strong> When you send a message, Junipa opens your own email, social or messaging app with
          the text ready, and you send it from your own account.
        </p>
        <p>We keep improving Junipa, so features may change. We won&apos;t remove a core feature of your paid plan during a period you have already paid for without giving you a fair alternative or a pro-rata refund.</p>
      </>
    ),
  },
  {
    id: "plans",
    title: "Plans, payment and cancellation",
    body: (
      <>
        <Ul>
          <li>
            <strong className="text-ink">Free:</strong> the brand profile, competitors, audiences and prospects, and a pipeline for up to 25 leads.
          </li>
          <li>
            <strong className="text-ink">Starter and Pro:</strong> paid subscriptions, billed monthly or yearly in advance, with the features shown on our pricing page
            when you subscribe. Yearly plans cost the same as ten months.
          </li>
          <li>
            <strong className="text-ink">Payment:</strong> our payment provider, Bachs, processes payments. Prices are in US dollars and exclude taxes, which are added
            where the law requires.
          </li>
          <li>
            <strong className="text-ink">Renewal:</strong> subscriptions renew automatically at the end of each period until you cancel. By subscribing, you authorise
            us, through Bachs, to charge your payment method each period.
          </li>
          <li>
            <strong className="text-ink">Cancelling:</strong> cancel any time from Billing (&ldquo;Manage subscription&rdquo;). You keep access until the end of the
            period you have paid for, then the account moves to the free plan. Your data stays; the free plan&apos;s limits apply to anything new (for example,
            no new leads beyond 25, and no new follow-up sequences).
          </li>
          <li>
            <strong className="text-ink">Refunds:</strong> payments are not refundable for partly used periods, except where the law gives you a right to a refund
            or to cancel. Nothing in these terms limits rights you have as a consumer under the law of your country.
          </li>
          <li>
            <strong className="text-ink">Failed payments:</strong> if a renewal payment fails, Bachs will retry and ask you to update your card. If payment isn&apos;t
            recovered, the subscription ends and the account moves to the free plan.
          </li>
          <li>
            <strong className="text-ink">Price changes:</strong> we will tell you at least 30 days before a price change affects you, and it applies from your next
            renewal. You can cancel before then.
          </li>
          <li>
            <strong className="text-ink">Founding members:</strong> if you subscribed at a founding price, you keep that price for as long as your subscription stays
            active without a break. If you cancel and later subscribe again, current prices apply.
          </li>
          <li>
            <strong className="text-ink">One-off purchases:</strong> social growth plans and campaigns bought before subscriptions are one-off purchases and give the
            access described when you bought them.
          </li>
        </Ul>
      </>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree to use Junipa lawfully and fairly. In particular, you will not:</p>
        <Ul>
          <li>send spam, or contact people in breach of anti-spam, marketing or privacy laws, including the GDPR and ePrivacy rules, the UK PECR, the US CAN-SPAM Act and TCPA, Canada&apos;s anti-spam law and the Nigeria Data Protection Act;</li>
          <li>ignore a request to stop contacting someone, or keep contacting a person who has asked you not to;</li>
          <li>break the rules of the platforms you send from, such as Instagram, WhatsApp, LinkedIn or your email provider;</li>
          <li>harass, threaten, deceive or impersonate anyone, or send unlawful, misleading or harmful content;</li>
          <li>use Junipa to make decisions about credit, employment, insurance, housing or other eligibility, or to collect sensitive personal data;</li>
          <li>copy, resell, publish or build a database or competing product from Junipa&apos;s research or service;</li>
          <li>access Junipa by automated means other than its normal interface, get around usage limits, or interfere with its security or other users;</li>
          <li>reverse engineer the service, except where the law allows it; or</li>
          <li>enter information you have no right to use, or confidential information you are not allowed to share with our AI providers.</li>
        </Ul>
        <p>We may limit, suspend or remove access, or remove content, if we reasonably believe you are breaking these rules.</p>
      </>
    ),
  },
  {
    id: "outreach",
    title: "Your responsibility for outreach",
    body: (
      <p>
        You decide who to contact, what to send and when. You are the sender and are responsible for your messages and for complying with the laws and platform rules
        that apply to them, including identifying yourself, giving people a way to opt out, and honouring opt-outs. Junipa adds an opt-out line to follow-up emails as a
        convenience; it doesn&apos;t make your outreach compliant on its own. If you send commercial email to the US, the law also requires your postal address.
      </p>
    ),
  },
  {
    id: "content",
    title: "Your content and data",
    body: (
      <>
        <p>
          You keep ownership of what you put into Junipa and, between you and us, of the research and drafts Junipa produces for you (&ldquo;your content&rdquo;). You
          give us a limited licence to host, process and display your content only to run, secure and improve the service for you.
        </p>
        <p>
          If you send us feedback or ideas, we may use them freely without owing you anything. Our <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>{" "}
          explains how we handle personal data, including data about the businesses and people our research finds.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "Research and AI output",
    body: (
      <p>
        Junipa&apos;s research is produced with AI and public sources. It can be incomplete, out of date or wrong, and similar requests can give different results. Check
        important facts, such as a person&apos;s role or contact details, before you rely on them. Junipa&apos;s output isn&apos;t legal, financial or other
        professional advice, and we don&apos;t promise any particular result, such as replies, meetings or sales.
      </p>
    ),
  },
  {
    id: "third-party",
    title: "Other services",
    body: <p>Junipa works with other services, such as Google sign-in, Bachs for payments, and the email and social apps you send from. Their own terms apply to your use of them, and we aren&apos;t responsible for them.</p>,
  },
  {
    id: "ip",
    title: "Our intellectual property",
    body: <p>The service, its software, design and the Junipa name and logo belong to us or our licensors. These terms give you the right to use the service as described; they don&apos;t transfer any ownership to you.</p>,
  },
  {
    id: "ending",
    title: "Ending these terms",
    body: (
      <>
        <p>
          You can stop using Junipa and ask us to delete your account at any time by emailing {mail}; cancel any subscription first. We may suspend or end your access
          if you seriously or repeatedly break these terms, if you don&apos;t pay, or if we must for legal reasons. Where reasonable, we will warn you first.
        </p>
        <p>If we close your account for reasons other than your breach, we will refund any unused part of a prepaid period. After an account ends, we delete its data as described in our Privacy Policy.</p>
      </>
    ),
  },
  {
    id: "warranty",
    title: "Disclaimer",
    body: (
      <p>
        We work hard to keep Junipa useful and available, but to the fullest extent the law allows, the service is provided &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo;, without warranties of any kind, express or implied, including fitness for a particular purpose, accuracy or uninterrupted availability.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <>
        <p>To the fullest extent the law allows:</p>
        <Ul>
          <li>we are not liable for indirect or consequential losses, or for lost profits, revenue, business opportunities, goodwill or data; and</li>
          <li>our total liability for all claims relating to the service is limited to the greater of the amount you paid us in the 12 months before the claim, or US$100.</li>
        </Ul>
        <p>Nothing in these terms limits liability that can&apos;t be limited by law, such as for fraud, or for death or personal injury caused by negligence.</p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <p>
        You agree to defend and compensate us against claims, losses and costs (including reasonable legal fees) that arise from your outreach, your content, or your
        breach of these terms or the law, except to the extent caused by us.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <>
        <p>
          If you have a problem, email {mail} first: most issues can be solved quickly, and we will try in good faith for 30 days before either of us starts formal
          proceedings.
        </p>
        <p>
          These terms are governed by the laws of the State of Delaware, USA, without regard to its conflict-of-law rules. The state and federal courts located in
          Delaware have exclusive jurisdiction, except that either of us may seek urgent relief in any court that has jurisdiction. If you are a consumer, you also keep
          the protection of the mandatory laws of the country where you live, and may bring claims in its courts.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: <p>We may update these terms as Junipa changes. For significant changes, we will give at least 30 days&apos; notice by email or in the app. If you keep using Junipa after a change takes effect, the new terms apply; if you don&apos;t agree, you can cancel before then.</p>,
  },
  {
    id: "general",
    title: "General",
    body: (
      <Ul>
        <li>These terms, with our Privacy Policy and the plan details shown when you subscribe, are the whole agreement between us about the service.</li>
        <li>If a court finds part of these terms unenforceable, the rest stays in effect.</li>
        <li>If we don&apos;t enforce a right straight away, we don&apos;t give it up.</li>
        <li>You may not transfer these terms without our consent; we may transfer them to a business that takes over Junipa, and will tell you if we do.</li>
        <li>We aren&apos;t responsible for delays or failures caused by events beyond our reasonable control.</li>
        <li>We may send you notices by email to your account address; you can send notices to {LEGAL.email}.</li>
      </Ul>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      other={{ href: "/privacy", label: "Privacy Policy" }}
      intro={
        <p className="rounded-[10px] border border-line bg-white p-4 text-[14px]">
          <strong className="text-ink">In short:</strong> use Junipa for honest business outreach, send messages from your own accounts and follow the anti-spam laws
          where your contacts are, check research before relying on it, and cancel your subscription whenever you like; you keep access until the end of the period
          you paid for.
        </p>
      }
      sections={sections}
    />
  );
}
