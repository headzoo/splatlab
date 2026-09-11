# Agent Instructions

This repository is a pnpm monorepo.

- Game code, assets, specs, maps, tools, and tests live in `apps/game`.
- The Vercel-hosted Next.js website lives in `apps/website`.
- The Game Editor app lives outside this repo as the sibling checkout `../game_editor`.

Before planning or making changes to the game app, read `apps/game/GAME.md`.
For sprite generation or editing, also follow the sprite-specific instructions
in `apps/game/AGENTS.md`.

When adding or approving new game assets, also update `apps/game/ASSETS.md` so
the AI recreation migration stays current.
