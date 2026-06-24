# Subprocessor Register & Data-Processing Terms

> What "DPAs on file" actually means for a small US company: you've accepted each vendor's **standard** Data Processing Addendum (DPA) and kept a record of it. US state laws (CCPA "service provider" contracts; WA MHMDA "processor" contracts) require a contract that limits how a vendor uses the data you share — the standard DPAs below satisfy that. You do **not** negotiate these; you accept/download the standard one. Last reviewed Jun 24 2026.

| Vendor | What it processes | Data terms / DPA | What you do |
|---|---|---|---|
| **Supabase** | DB, auth, storage, edge functions — all app data at rest | https://supabase.com/legal/dpa | Review the PDF; if you want it executed, complete their PandaDoc. For US-only, accepting their standard terms is the practical bar. |
| **Vercel** | Hosting / CDN (request metadata, IP) | https://vercel.com/legal/dpa | Standard DPA, part of Vercel's terms — downloadable, no negotiation. |
| **Stripe** | Payments (name, email, **card data** — their scope) | https://stripe.com/legal/dpa | Built into the Stripe Services Agreement you **already accepted**. Nothing to sign. |
| **Resend** | Transactional email (address + content) | https://resend.com/legal | Accept their standard DPA/terms. |
| **Anthropic** | AI generation — **health data in prompts** | Commercial Terms (+ optional ZDR) | Covered by default — see note below. |
| **USDA FoodData Central** | Food search (typed food name only) | Public US-gov API | N/A — no personal/health data is sent. |
| **Google** (OAuth) | Optional sign-in (name, email) | Google API/Cloud terms | On hold until OAuth is enabled pre-launch. |

## Anthropic — data-processing note (satisfies the Privacy Policy claim)
- Gardnr calls `api.anthropic.com` with an API key → usage is governed by Anthropic's **Commercial Terms**, under which Anthropic **does not train its models on your API inputs/outputs**. (The widely-reported 5-year *consumer* training change does **not** apply to API/Commercial use.)
- **Default retention:** API inputs/outputs are auto-deleted within ~**30 days** (kept only to screen for abuse), then deleted.
- **Zero Data Retention (ZDR):** an optional addendum for qualifying customers who want nothing stored at all. Not required for Gardnr's use; request from Anthropic only if you later want it.
- ⇒ The Privacy Policy + Consumer Health Data Policy statement ("we do not use your health data to train AI models") is **accurate** under these terms. No action needed.

Sources: Anthropic [data retention](https://privacy.claude.com/en/articles/10023548-how-long-do-you-store-my-data) · [API data retention docs](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention); [Supabase DPA](https://supabase.com/legal/dpa) · [Vercel DPA](https://vercel.com/legal/dpa) · [Stripe DPA](https://stripe.com/legal/dpa) · [Resend legal](https://resend.com/legal).
