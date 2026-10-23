# Junia

AI go-to-market research for fashion, retail and service businesses. Type a website and Junia:

1. **Your brand**: reads the site and socials (what you sell, price tier, keywords, strengths, growth gaps)
2. **Competitors**: real competing brands, ranked by overlap, plus the opening you can own
3. **Audiences**: buyer groups worth chasing (boutiques, stylists, event planners…), each with a pain, a hook and a best channel
4. **Prospects**: real businesses in each audience, with recent "reach out now" signals
5. **Decision makers**: named people confirmed on public pages (optional verified emails via Hunter)
6. **Outreach**: a 4-step DM / email / WhatsApp sequence, with one-click copy, Instagram DM, mailto and a CSV export

## Run it

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY for live research
npm run dev                  # http://127.0.0.1:3500
```

Without `ANTHROPIC_API_KEY`, the app runs in **demo mode** with clearly labelled, made-up sample data (`.example` domains). Outbound DM and email buttons stay off in demo mode.

## How it works

- `src/lib/engine.ts`: each step runs Claude (`claude-opus-5-5`) with web search + web fetch to gather notes, then a second call turns the notes into typed JSON (`src/lib/schema.ts`). Progress (searches, pages read) streams to the UI as NDJSON from `/api/run`.
- `src/lib/industries.ts`: industry presets that steer who counts as a buyer and which channels work.
- `src/lib/store.ts`: workspaces are saved in the browser (localStorage) for now.
- `src/components/WorkspaceView.tsx`: the six-step workspace UI.

## Before launching as a paid SaaS

- Accounts and a database (replace `store.ts`), e.g. Supabase
- Billing and usage limits per plan (each live step costs real API spend)
- Rate limiting on `/api/run`
- Sending from the app (email provider, WhatsApp Business API) and reply tracking
