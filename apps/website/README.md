# Chickensplat Website

This is the Chickensplat website app, a Next.js TypeScript project bootstrapped
with `create-next-app`.

## Development

From the monorepo root:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm --filter website test
```

The app source lives in `src/app`.

With no environment file, local development uses in-memory auth and game
stores. They survive hot reloads but reset when the dev server restarts. For
persistent storage, provide the values in `.env.example`. `DATABASE_URL` is the
Neon URL used by the app. Prisma Migrate prefers `DIRECT_URL`, then Vercel's
`DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING`, and otherwise uses
`DATABASE_URL`, so a separate direct Neon endpoint is optional.

Generate Prisma Client and deploy the checked-in migrations with:

```bash
pnpm --filter website db:generate
pnpm --filter website db:migrate
```

The first Prisma migration is a baseline matching the original checked-in
Drizzle auth migration. On an existing database where that Drizzle migration
was already applied, mark the baseline as applied once before deploying the
game migration:

```bash
pnpm --filter website exec prisma migrate resolve --applied 20260912000000_existing_auth_schema
pnpm --filter website db:migrate
```

Prisma is the runtime ORM for Better Auth and game CRUD. The earlier Drizzle
schema and migration remain checked in as migration history only.

New Lab Keys use four cryptographically random six-digit blocks followed by a
six-digit private HMAC tag, for example
`482917-063541-829304-771625-038451`. The readable key is returned only when it
is created. The database stores a peppered lookup digest and a slow password
hash; replacing a key removes the old lookup immediately. Existing word-based
Lab Keys remain accepted so deployments can upgrade without locking out an
existing workspace. Each Lab session is stamped with the workspace key version.
Replacing a key revokes every prior session and gives only the rotating browser
a replacement session. The Lab Workspace also offers **Sign Out Everywhere**,
which invalidates all sessions without changing the recovery key.

## Vercel

Create the Vercel project with `apps/website` as the project root directory.
The app uses pnpm and the generated Next.js defaults. Connecting the project to
Neon through Vercel supplies `DATABASE_URL` and may also supply an unpooled
connection variable that Prisma Migrate will prefer. Optionally add
`DIRECT_URL` to select a separate direct endpoint explicitly. Configure
`BETTER_AUTH_SECRET`, `LAB_KEY_PEPPER`, `LAB_KEY_CHECKSUM_SECRET`, and
`BETTER_AUTH_URL` before deploying. The checksum secret is server-only and
should be a separate random value of at least 32 bytes. Keep it stable across
deployments: changing it invalidates the private checksum on every numeric Lab
Key, so rotation requires a controlled key-reissue or dual-secret migration.
Add preview origins to
`BETTER_AUTH_TRUSTED_ORIGINS` as a comma-separated list when previews need to
exercise authentication. Apply database migrations separately before sending
traffic to a deployment that uses the new schema. Saved-game thumbnails are
downscaled in the browser and stored with the game row in Neon; the Vercel
runtime does not write generated images to its local filesystem. Screenshot
uploads reserve one of 48 owner-scoped database slots before writing the blob
and become visible only after the media row is finalized. Keep the screenshot
quota migration and application deployment together.

Video media requires the same public Vercel Blob store and the media quota
migration to be deployed before application traffic. Set `NEXT_PUBLIC_SITE_URL`
to the stable HTTPS production domain (not a preview URL); shared-media pages
and social metadata use this origin. Add preview URLs to
`BETTER_AUTH_TRUSTED_ORIGINS` only when those environments need sign-in.

The `/api/media/video` Node function includes the `ffmpeg-static` binary
through Next output tracing. Browser captures are intentionally muted, limited
to ten seconds, and accepted only as bounded MP4/WebM sources plus a PNG
poster. The function transcodes them to H.264/yuv420p fast-start MP4, uploads
only the final MP4 and poster to public Blob paths, and releases a pending
reservation on failure. pnpm is configured to run `ffmpeg-static`'s install
script; a clean install must leave its binary executable. Vercel Functions
accept at most a 4.5 MB request body, so each capture is constrained to a
3 MiB source plus a 512 KiB PNG poster, with multipart overhead reserved under
a conservative 4 MiB aggregate ceiling. The client and server both enforce
that aggregate limit before transcoding.

Before deploying, run `pnpm --filter website db:migrate`, then
`pnpm --filter website build`.

After a production or preview deployment with a sample video, validate social
metadata against the stable custom domain configured in
`NEXT_PUBLIC_SITE_URL` (not a short-lived preview URL when sharing publicly):

1. Open `/media/<id>` without cookies and confirm the HTML includes absolute
   HTTPS `og:video`, `og:image`, `twitter:card=player`, `twitter:player`,
   `twitter:player:stream`, and matching width/height tags.
2. Open `/media/<id>/embed` directly and inside a test iframe. Confirm the MP4
   plays with poster, controls, and the canonical back link to the share page.
3. Run the same stable URL through available validators such as the
   [X Card Validator](https://cards-dev.twitter.com/validator) and a general
   Open Graph debugger (for example Meta Sharing Debugger or opengraph.xyz).
   Keep the public MP4 and poster Blob URLs reachable over HTTPS with byte-range
   support.

X, Facebook, Slack, Discord, and other networks independently decide whether
to render inline player cards and may require separate domain approval. The
poster-backed public share page at `/media/<id>` is the required fallback when
a network refuses iframe playback or has not approved the player domain.
