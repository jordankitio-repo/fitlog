# Subprocessor Register & Data-Processing Terms

> What "DPAs on file" actually means for a small US company: you've accepted each vendor's **standard** Data Processing Addendum (DPA) and kept a record of it. US state laws (CCPA "service provider" contracts; WA MHMDA "processor" contracts) require a contract that limits how a vendor uses the data you share — the standard DPAs below satisfy that. You do **not** negotiate these; you accept/download the standard one. Last reviewed Jun 24 2026.

| Vendor | What it processes | Data terms / DPA | What you do |
|---|---|---|---|
| **Supabase** | DB, auth, storage, edge functions — all app data at rest | https://supabase.com/legal/dpa | ✅ **DPA executed Jun 25 2026** (signed by Digigarden LLC; copy on file). |
| **Vercel** | Hosting / CDN (request metadata, IP) | https://vercel.com/legal/dpa | Standard DPA, part of Vercel's terms — downloadable, no negotiation. |
| **Stripe** | Payments (name, email, **card data** — their scope) | https://stripe.com/legal/dpa | Built into the Stripe Services Agreement you **already accepted**. Nothing to sign. |
| **Resend** | Transactional email (address + content) | https://resend.com/legal | ✅ **DPA executed Jun 25 2026** (Resend = Plus Five Five, Inc.; signed by Digigarden LLC; copy on file). |
| **Anthropic** | AI generation — **health data in prompts** | Commercial Terms (+ optional ZDR) | Covered by default — see note below. |
| **USDA FoodData Central** | Food search (typed food name only) | Public US-gov API | N/A — no personal/health data is sent. |
| **Google** (OAuth) | Optional sign-in (name, email) | Google API/Cloud terms | On hold until OAuth is enabled pre-launch. |

## Anthropic — data-processing note (satisfies the Privacy Policy claim)
- Gardnr calls `api.anthropic.com` with an API key → usage is governed by Anthropic's **Commercial Terms**, under which Anthropic **does not train its models on your API inputs/outputs**. (The widely-reported 5-year *consumer* training change does **not** apply to API/Commercial use.)
- **Default retention:** API inputs/outputs are auto-deleted within ~**30 days** (kept only to screen for abuse), then deleted.
- **Zero Data Retention (ZDR):** an optional addendum for qualifying customers who want nothing stored at all. Not required for Gardnr's use; request from Anthropic only if you later want it.
- ⇒ The Privacy Policy + Consumer Health Data Policy statement ("we do not use your health data to train AI models") is **accurate** under these terms. No action needed.

Sources: Anthropic [data retention](https://privacy.claude.com/en/articles/10023548-how-long-do-you-store-my-data) · [API data retention docs](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention); [Supabase DPA](https://supabase.com/legal/dpa) · [Vercel DPA](https://vercel.com/legal/dpa) · [Stripe DPA](https://stripe.com/legal/dpa) · [Resend legal](https://resend.com/legal).

---

## DPA "Processing Details" — standard answers (use for every vendor)

When a vendor's DPA asks you (the Customer) to describe the processing (Annex I / Schedule), the answers are the same regardless of vendor — Gardnr is always the **controller**. Copy these:

| Field | Value |
|---|---|
| **Customer name** | `Digigarden LLC` |
| **Customer address** | _[your Digigarden LLC registered/business address — the one on file with the TX Secretary of State / your registered agent]_ |
| **Customer contact** | `digigardenllc@gmail.com` (the address published in your Privacy/Terms; or your monitored ops email) |
| **Customer role** | **Controller / business** (you decide the purpose & means; the vendor is the processor/service provider) |
| **Categories of personal data** | Identity/account (name, email, hashed password); **health & fitness data** (body weight, body measurements, nutrition/diet intake, cardio, step counts, body-composition goals); biometric/profile (sex, date of birth, height, activity level); profile photo; coaching content (check-ins, coach notes, reports, messages); usage/technical (IP, device, usage). _No card data — Stripe handles payments._ |
| **Categories of data subjects** | The Customer's authorized users and end users — i.e. coaches, their clients, and individual (solo) users of the Gardnr app. |
| **Special categories of personal data** | **Specify (not "None"):** data concerning health — body weight, body measurements, nutrition intake, physical activity, body-composition goals, and profile photographs. _(Cautious/consistent with treating this as consumer health data. See note below.)_ |
| **Frequency of transfer** | Continuous |
| **Nature of processing** | Storage, hosting, deletion, rectification, analysis, transfer, aggregation |
| **Purpose of processing** *(if asked)* | To provide the Gardnr nutrition- and body-composition-coaching service requested by the Customer and its users. |
| **Duration** *(if asked)* | For the term of the agreement; data deleted on account/contract termination per Gardnr's retention policy. |

**Note on "special categories":** that's GDPR Art. 9 language. You're US-only, so GDPR doesn't strictly apply — but vendors ship one global DPA, and your data is health-related, so declaring "data concerning health" is the honest, consistent choice and signals the vendor to handle it as sensitive. (You could defensibly pick "None" since fitness/wellness data is borderline and you're not GDPR-bound, but declaring it matches your overall consumer-health-data posture.) **Only two fields are truly yours to supply: the address, and confirming the contact email.**
