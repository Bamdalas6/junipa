import type { Metadata } from "next";
import { LEGAL, LegalPage, Table, Ul, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy · Junia",
  description: "How Junia collects, uses and protects personal data, including data about the businesses and people its research finds.",
};

const mail = (
  <a href={`mailto:${LEGAL.email}`} className="text-accent hover:underline">
    {LEGAL.email}
  </a>
);

const sections: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          {LEGAL.product} is an outbound research service at {LEGAL.site}, operated by {LEGAL.operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We decide how and why
          personal data is used in the service, which makes us the controller of that data under the EU and UK General Data Protection Regulation (GDPR), the Nigeria
          Data Protection Act 2023 (NDPA) and similar laws.
        </p>
        <p>For anything in this policy, including exercising your rights, contact us at {mail}.</p>
      </>
    ),
  },
  {
    id: "collect",
    title: "Information we collect from you",
    body: (
      <>
        <p>We only collect what we need to run the service:</p>
        <Table
          head={["What", "Details", "Why"]}
          rows={[
            ["Account details", "Email address, optional name, and a password. We store only a salted, one-way hash of your password, never the password itself.", "To create and secure your account."],
            ["Google sign-in", "If you continue with Google: your name, email address, profile picture and Google account ID. We don't receive your Google password.", "To sign you in."],
            ["Research workspaces", "The websites you research, any goal or target market you set, and the research Junia produces for you (profiles, competitors, audiences, prospects, decision makers, outreach drafts).", "To provide the research and save it to your account."],
            ["Pipeline", "Leads you track, their status, notes you write, messages you log as sent, and follow-up drafts and schedules.", "To provide results tracking and follow-up reminders."],
            ["Social growth plans", "The social profile links or handles you enter, and the public information those profiles show.", "To write the plan you asked for."],
            ["Billing", "Your plan, billing period, subscription status, renewal date, amount and our payment provider's customer and subscription IDs. Card details go directly to our payment provider; we never see or store them.", "To give you the plan you pay for."],
            ["Technical data", "IP address, browser type and request logs, kept by our hosting provider for a short period. We hold IP addresses in memory briefly to limit abuse (rate limiting).", "To keep the service secure and working."],
          ]}
        />
        <p>
          You don&apos;t have to give us personal data to try the free brand profile. To use the later research steps, you need an account; to use the paid features, a
          subscription.
        </p>
      </>
    ),
  },
  {
    id: "research-data",
    title: "Information about businesses and people our research finds",
    body: (
      <>
        <p>
          To help you find customers, Junia researches businesses and the people who make buying decisions at them. If you are one of those people, this section
          explains what we hold about you.
        </p>
        <Ul>
          <li>
            <strong className="text-ink">What:</strong> business information (name, website, location, size, what it sells) and, for decision makers, name, job title,
            employer, business contact details the business itself publishes, and links to public professional profiles such as LinkedIn.
          </li>
          <li>
            <strong className="text-ink">Where it comes from:</strong> publicly available sources only: the business&apos;s own website, public web pages and search
            results, and public profiles. We don&apos;t buy contact lists or guess private email addresses.
          </li>
          <li>
            <strong className="text-ink">What we don&apos;t collect:</strong> home addresses, personal phone numbers, or sensitive information such as health, religion,
            ethnicity, political views or sexual orientation.
          </li>
          <li>
            <strong className="text-ink">Why, and our legal basis:</strong> to let our users find relevant business contacts and introduce their products, which is our
            and our users&apos; legitimate interest in business-to-business communication. We weigh this against your interests by limiting the data to your
            professional role, using only public sources, and making it easy to object.
          </li>
          <li>
            <strong className="text-ink">Who sees it:</strong> the user whose research found you, in their private workspace and pipeline. We don&apos;t publish it,
            sell it, or use it to market our own services to you.
          </li>
          <li>
            <strong className="text-ink">Your choice:</strong> you can ask us at any time what we hold about you, and ask us to delete it and not to include you in future
            research. Email {mail}. When a Junia user contacts you, they do so from their own email or social accounts and are responsible for that outreach (see
            section 12).
          </li>
        </Ul>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use information, and our legal bases",
    body: (
      <>
        <Table
          head={["Purpose", "Legal basis (GDPR / NDPA)"]}
          rows={[
            ["Providing the service: accounts, research, workspaces, pipeline, follow-up reminders, billing", "Performance of our contract with you"],
            ["Researching businesses and their decision makers from public sources", "Legitimate interests (business-to-business prospecting), as described in section 3"],
            ["Keeping the service secure, preventing abuse and fraud, fixing problems", "Legitimate interests"],
            ["Improving the service (for example, checking research quality)", "Legitimate interests"],
            ["Sending account and billing emails, and answering your requests", "Performance of our contract; legal obligation"],
            ["Keeping tax and accounting records", "Legal obligation"],
          ]}
        />
        <p>We don&apos;t use your data for advertising, and we don&apos;t make decisions about you based solely on automated processing that have legal or similarly significant effects.</p>
      </>
    ),
  },
  {
    id: "ai",
    title: "How we use AI",
    body: (
      <>
        <p>
          Junia uses third-party AI models to write research and outreach drafts. To do this we send the model the relevant context: the website being researched,
          public page text and search results, and for drafts, the research notes and your earlier message. We don&apos;t send your password or payment details.
        </p>
        <p>
          AI providers process this data under their own terms. At the time of writing, part of our AI processing runs on a Google service tier under which Google may
          use submitted content to improve its products, so please don&apos;t enter confidential information into research fields. We will update this section if
          that changes.
        </p>
        <p>AI output can be wrong or out of date. Junia checks businesses and people against public pages, but you should verify anything important before relying on it.</p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share information with",
    body: (
      <>
        <p>We share personal data only with service providers that help us run Junia, and only what each needs:</p>
        <Table
          head={["Provider", "What they do", "Data involved"]}
          rows={[
            ["Cloudflare", "Hosting, database, content delivery, security and request logs", "All service data, stored on our behalf"],
            ["Google", "Google sign-in; AI models (Gemini)", "Sign-in details; research context sent for AI processing"],
            ["Tavily", "Web search", "Search queries about businesses and roles"],
            ["Bachs", "Payments and subscriptions", "Your email, plan, payment and billing details"],
            ["Resend", "Sending account emails, such as password reset links", "Your email address and the email's contents"],
            ["Anthropic (if used)", "AI models", "Research context sent for AI processing"],
            ["Hunter (if enabled)", "Checking whether a business email address is valid", "A decision maker's name and business domain"],
          ]}
        />
        <p>We may also share information if the law requires it, to protect people&apos;s rights and safety, or as part of a merger, acquisition or sale of the business, in which case this policy continues to apply to it.</p>
        <p>
          We do not sell personal data, and we do not &ldquo;share&rdquo; it for cross-context behavioural advertising, as those terms are used in the California
          Consumer Privacy Act (CCPA).
        </p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "International transfers",
    body: (
      <p>
        Our providers operate in several countries, including the United States, so your data may be processed outside your own country. Where the GDPR, UK GDPR or NDPA
        requires it, we rely on adequacy decisions or standard contractual clauses (or the equivalent safeguards) offered by our providers to protect transferred data.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep information",
    body: (
      <Ul>
        <li>Account details: while your account exists. When you ask us to delete your account, we delete it within 30 days.</li>
        <li>Workspaces, pipeline, messages and follow-ups: until you delete them or your account.</li>
        <li>Research data about businesses and people: as part of the workspace it belongs to, or until the person asks us to remove it.</li>
        <li>Sign-in sessions: 30 days, or until you sign out.</li>
        <li>Billing records: as long as tax and accounting law requires.</li>
        <li>Request logs: a short period, set by our hosting provider, for security and troubleshooting.</li>
      </Ul>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        We use encrypted connections (HTTPS), store passwords as salted one-way hashes, store only hashed versions of sign-in tokens, keep each user&apos;s data
        separate, and limit how fast anyone can make requests. No system is perfectly secure; if a breach affects your personal data, we will notify you and the
        relevant authorities as the law requires.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Depending on where you live, you have the right to:</p>
        <Ul>
          <li>know what personal data we hold about you and get a copy of it;</li>
          <li>have inaccurate data corrected;</li>
          <li>have your data deleted;</li>
          <li>receive your data in a portable format;</li>
          <li>object to processing based on legitimate interests, including research about you;</li>
          <li>restrict our processing in certain cases;</li>
          <li>withdraw consent where we rely on it; and</li>
          <li>complain to a data protection authority, such as your local EU authority, the UK Information Commissioner&apos;s Office, or the Nigeria Data Protection Commission.</li>
        </Ul>
        <p>
          <strong className="text-ink">California residents</strong> have the right to know, delete and correct personal information, and to opt out of its sale or
          sharing (we don&apos;t sell or share it). We won&apos;t treat you differently for using these rights. You may use an authorised agent to make a request.
        </p>
        <p>
          To use any of these rights, email {mail}. We may need to confirm your identity first. We aim to reply within 30 days (45 days where California law allows).
          You can also delete workspaces yourself in the app, and signing out removes the copy saved in your browser.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and browser storage",
    body: (
      <>
        <p>We use no advertising or analytics cookies. We use only what the service needs to work:</p>
        <Table
          head={["Name", "Type", "Purpose", "Lasts"]}
          rows={[
            ["junia_session", "Cookie (essential)", "Keeps you signed in", "30 days"],
            ["junia_oauth", "Cookie (essential)", "Protects Google sign-in while you complete it", "10 minutes"],
            ["reachly:… keys", "Browser storage", "Saves your research and pending checkouts in your browser", "Until you clear them or sign out"],
            ["junia-theme", "Browser storage", "Remembers light or dark mode", "Until you clear it"],
          ]}
        />
        <p>Our hosting provider may set its own security cookies to protect the site from attacks.</p>
      </>
    ),
  },
  {
    id: "your-outreach",
    title: "When you contact the people Junia finds",
    body: (
      <p>
        Junia drafts messages, but you send them from your own email and social accounts. For that outreach, you decide who to contact and how, so you are responsible
        for following the laws that apply, including the GDPR and ePrivacy rules, the UK PECR, the US CAN-SPAM Act, Canada&apos;s anti-spam law, the NDPA, and each
        platform&apos;s rules. Honour every request to stop contacting someone. Our <a href="/terms" className="text-accent hover:underline">Terms of Service</a> say more.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>Junia is a business tool for adults. It isn&apos;t meant for anyone under 18, and we don&apos;t knowingly collect data from children. If you think a child has given us data, contact us and we will delete it.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>We will update this policy when our practices change, and change the date at the top. If a change is significant, we will tell you by email or in the app before it takes effect.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      other={{ href: "/terms", label: "Terms of Service" }}
      intro={
        <>
          <p>
            This policy explains how {LEGAL.product} collects, uses and protects personal data: yours, if you use Junia, and that of the businesses and people our
            research finds.
          </p>
          <p className="rounded-[10px] border border-line bg-white p-4 text-[14px]">
            <strong className="text-ink">In short:</strong> we collect what we need to run the service, we research businesses only from public sources, we use no
            advertising or analytics trackers, we never sell personal data, and you can ask us to see, correct or delete your data at any time by emailing {mail}.
          </p>
        </>
      }
      sections={sections}
    />
  );
}
