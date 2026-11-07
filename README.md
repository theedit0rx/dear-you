# Dear You

A small, considered gifting and connection platform: digital cards, private two-person experiences, a free community competition, server-recorded Love Coins, and a Premium Studio that never affects competition fairness.

## Current implementation boundary

- **This sandbox:** Next.js 16 / React / TypeScript with PostgreSQL through Drizzle ORM. The app’s `/api/*` routes are runnable against the configured `DATABASE_URL` and enforce server-side authentication, ownership, role checks, throttling, and audit writes.
- **Cloudflare target:** `worker/` is a separate D1/R2 Worker named `dear-you-api`, configured for the supplied `dear-you-db` database ID. Set `NEXT_PUBLIC_DEAR_YOU_API_URL` to the deployed Worker’s same-site custom API origin to route browser API calls there.
- **Not verified or deployed:** no Cloudflare deployment was performed in this environment. R2 activation is pending, so the `dear-you-media` bucket and its CORS policy must be created after activation. Stripe remains unavailable until the owner supplies test-mode configuration.

The Worker and PostgreSQL adapters use separate password hash formats (PBKDF2 in Workers, scrypt in the Node app). If accounts are moved between stores, use an explicit migration/password-reset process; do not copy or reinterpret hashes.

## Local development

1. Configure `DATABASE_URL` for the local PostgreSQL instance (the sandbox bootstrap supplies this).
2. Install dependencies with `npm install`.
3. Apply the Drizzle PostgreSQL schema: `npx drizzle-kit push`.
4. Start the app: `npm run dev`.
5. Run the business-rule tests: `npx vitest run`.

PostgreSQL schema changes are represented by `src/db/schema.ts` and the `drizzle/` SQL migrations. The D1 schema is separately versioned in `worker/migrations/`.

### PostgreSQL migrations

```sh
npx drizzle-kit generate        # after editing src/db/schema.ts
npx drizzle-kit push            # sandbox/local convenience: sync the schema directly
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0000_wise_blonde_phantom.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0001_bond_of_the_year.sql
```

`drizzle/0001_bond_of_the_year.sql` is a data migration: it opens the current Bond of the Year edition (rules, published rubric, and deadline) in the `competitions` table. The UI reads this row; nothing about the competition is hardcoded in the interface. Re-running it is safe (`ON CONFLICT DO NOTHING`). To pause the public competition without deploying, set its `status` to `draft`, `judging`, or `closed` — the submission API rejects entries whenever the row is not `open` and the deadline is in the future.

## App environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | For the Next/PostgreSQL adapter | PostgreSQL connection string; server-side only. |
| `NEXT_PUBLIC_DEAR_YOU_API_URL` | Optional | Worker API origin, e.g. `https://api.your-real-domain.tld` (no trailing slash). Leave unset to use the local PostgreSQL routes. Use a same-site custom domain and configure the Worker’s exact `APP_ORIGIN`; `workers.dev` may be treated as a third-party-cookie context by browsers. |
| `STRIPE_SECRET_KEY` | Optional | Stripe **test-mode** secret (`sk_test_…`); stored server-side only. Live keys are deliberately rejected. |
| `STRIPE_PRICE_ID` | Optional | A real Stripe recurring test price ID created by the business owner. No price is invented in the UI. |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe webhook signing secret (`whsec_…`). Membership status changes only after signature verification. |

Copy `.env.example` as a reference only. Never commit `.env`, `.dev.vars`, or real payment credentials.

## Cloudflare Worker (D1 + R2)

The configuration in `worker/wrangler.jsonc` binds:

- D1 `dear-you-db`, ID `6182ba8e-bfeb-4ba3-81d7-62283beb3b2e` (`DB`).
- R2 bucket `dear-you-media` (`MEDIA`). R2 is private by default; do not enable public bucket access for user media.
- `APP_ORIGIN`, an exact origin with scheme and host only (no trailing slash or path).

The Worker is not deployed by this repo. After confirming the connected account, domain, and R2 activation, set `APP_ORIGIN` in the Wrangler config to the actual application origin. Do not leave the example placeholder in production.

### D1 migrations

From the repository root, once Wrangler is authenticated to the intended Cloudflare account:

```sh
npx wrangler d1 migrations list dear-you-db --remote --config worker/wrangler.jsonc
npx wrangler d1 migrations apply dear-you-db --remote --config worker/wrangler.jsonc
```

For isolated local D1 testing, use `--local` instead of `--remote`. Review the target and backup policy before applying anything to the existing remote database. D1 migration history is recorded by Wrangler in `d1_migrations`.

### R2 activation and CORS (pending)

After R2 is enabled in the Cloudflare Dashboard:

```sh
npx wrangler r2 bucket create dear-you-media
npx wrangler r2 bucket cors set dear-you-media --file worker/r2-cors.wrangler.json
npx wrangler r2 bucket cors list dear-you-media
```

Before applying the CORS template, replace `https://your-production-domain.example` with the real app origin and add only the actual local-development origin(s). Do not use `*` for an authenticated media bucket. CORS is not authorization: R2 stays private and the Worker validates the session, image content type, 5 MB size limit, and owner before writing or reading an object.

The upload API uses the authenticated Worker endpoint (`POST /api/media`) rather than exposing an R2 credential or making the bucket public. Only JPEG, PNG, and WebP are accepted; SVG is excluded. The example CORS policy is also available through Cloudflare’s R2 bucket Settings if applying via the Dashboard is preferred.

### Worker secrets and deployment

The Worker needs no R2 access-key secret: it uses the `MEDIA` binding. Stripe values, if configured, are encrypted Worker secrets:

```sh
npx wrangler secret put STRIPE_SECRET_KEY --config worker/wrangler.jsonc
npx wrangler secret put STRIPE_PRICE_ID --config worker/wrangler.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET --config worker/wrangler.jsonc
```

Set `APP_ORIGIN` as a Wrangler variable, not a secret. Use a Stripe **test** key and a real test price. Configure the Stripe test webhook to `https://<actual-worker-domain>/api/billing/webhook` and subscribe to `checkout.session.completed` and `customer.subscription.created`, `.updated`, and `.deleted`. A checkout return URL by itself does not grant Premium.

After D1 migrations, R2 activation/CORS, secret configuration, and origin review:

```sh
npx wrangler dev --config worker/wrangler.jsonc
npx wrangler deploy --config worker/wrangler.jsonc
```

Then set `NEXT_PUBLIC_DEAR_YOU_API_URL` to the resulting **same-site custom API origin** and redeploy the Next app. Test cookies, CORS, media ownership, and webhooks end-to-end in the chosen production domain before inviting users.

### First administrator

Self-service signup always creates the `user` role. There is no browser/API route that promotes an account. After verifying the correct account and environment, promote the initial operator through a reviewed, audited database operation using a restricted deployment credential; never expose an admin bootstrap secret in the client or public source.

## Product and security notes

- Drafts are private until a user explicitly enables a unique, high-entropy share link. Public share routes return only card/story fields, never owner email or account details, and are marked `noindex`.
- Passwords are hashed; session cookies are HttpOnly, Secure in production, and same-site. Mutations check the request origin. Authentication, creation, checkout, entry, and report endpoints are rate-limited.
- Competition entries are free, limited to one per account, checked against the open status/deadline on the server, and held for human moderation. The published rubric totals 100%; Premium, purchases, and Love Coins are not part of eligibility or scoring.
- Love Coins have no client mutation route. The first saved card can earn a one-time 5-coin thank-you, recorded with the card in an auditable transaction. Contest activity and purchases earn no coins.
- Premium is a verified subscription state from Stripe’s signed webhook, never a client value. Checkout returns an error and takes no payment until test credentials and a real recurring price are configured.
- Email addresses are not currently verified by an email provider. Do not present them as verified; add a configured verification flow before relying on email ownership for sensitive eligibility or recovery.

## Official Cloudflare references

- [Wrangler configuration and bindings](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [R2 CORS configuration](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

## Premium UI refresh (November 2026)

The selected baseline is the fuller project archive (`dear-you-platform-development (1).zip`), which includes the Bond of the Year feature, its competition migration, and the phone showcase. The homepage order has been refined so the Bond of the Year feature appears immediately after the hero, before the product showcase. Existing application flows, API routes, database adapters, and competition fairness rules are preserved.

Design direction: restrained warm-neutral and rose palette, editorial typography, generous whitespace, clear hierarchy, accessible focus states, responsive layouts, and selective motion. The visual references inform the design approach rather than introducing unnecessary dependencies or decorative effects.
