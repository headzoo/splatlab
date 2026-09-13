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

Lab Keys use the memorable `TACO-MOON-FROG-82` format. The readable key is
returned only when it is created. The database stores a peppered lookup digest
and a slow password hash; replacing a key removes the old lookup immediately.

## Vercel

Create the Vercel project with `apps/website` as the project root directory.
The app uses pnpm and the generated Next.js defaults. Connecting the project to
Neon through Vercel supplies `DATABASE_URL` and may also supply an unpooled
connection variable that Prisma Migrate will prefer. Optionally add
`DIRECT_URL` to select a separate direct endpoint explicitly. Configure
`BETTER_AUTH_SECRET`, `LAB_KEY_PEPPER`, and `BETTER_AUTH_URL` before deploying.
Add preview origins to
`BETTER_AUTH_TRUSTED_ORIGINS` as a comma-separated list when previews need to
exercise authentication. Apply database migrations separately before sending
traffic to a deployment that uses the new schema. Saved-game thumbnails are
downscaled in the browser and stored with the game row in Neon; the Vercel
runtime does not write generated images to its local filesystem.
