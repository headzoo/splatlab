import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { AgentFlowRunStore } from "@/lib/agent-flow/run-store";
import { getGame } from "@/lib/games";
import { GAME_PLAYER_CONTENT } from "@/game/game-player-content";
import { SiteHeader } from "../site-header";
import { BuildChat } from "./build-chat";
import { BuildGamePreview } from "./build-game-preview";
import { BuildSetupProvider } from "./build-setup";

import styles from "./build.module.css";

export const metadata: Metadata = {
  title: "Build a Game | Splat Lab!",
  description: "Create a Splat Lab game with Cooper.",
};

export const dynamic = "force-dynamic";

type BuildPageProps = {
  searchParams: Promise<{ game?: string | string[] }>;
};

export default async function BuildPage({ searchParams }: BuildPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/?lab-key=1");
  }

  const gameParam = (await searchParams).game;
  const gameId = Array.isArray(gameParam) ? gameParam[0] : gameParam;
  const initialGame = gameId ? await getGame(session.user.id, gameId) : null;

  if (gameId && !initialGame) {
    redirect("/lab");
  }
  const activeRun = initialGame
    ? await new AgentFlowRunStore().loadActive(session.user.id, initialGame.id)
    : null;
  const initialPausedBuildTurn =
    activeRun?.status === "paused"
      ? {
          feedbackEnabled:
            (() => {
              const pending = activeRun.pendingHumanInput;
              if (!pending || typeof pending !== "object") return false;
              return "enableFeedback" in pending && pending.enableFeedback === true;
            })(),
        }
      : null;

  return (
    <main className={styles.page} id="main-content">
      <Image
        className={styles.pageBackground}
        src="/brand/homepage/hero-background.png"
        alt=""
        fill
        priority
        sizes="100vw"
        unoptimized
      />
      <div className={styles.pageWash} />
      <SiteHeader />

      <BuildSetupProvider
        initialSpec={initialGame?.spec ?? null}
        initialIdentity={
          initialGame
            ? { id: initialGame.id, revision: initialGame.revision }
            : null
        }
        initialPausedBuildTurn={initialPausedBuildTurn}
      >
        <div className={styles.workspace}>
          <section className={styles.builderPanel} aria-labelledby="builder-title">
            <header className={styles.builderHeading}>
              <Image
                className={styles.headingCooper}
                src="/brand/about/cooper-hero.png"
                alt="Cooper, your game-building guide"
                width={1399}
                height={1124}
                priority
                unoptimized
              />
              <div>
                <span className={styles.mockBadge}>Map setup</span>
                <h1 id="builder-title">Build with Cooper</h1>
                <p>Tell me what you want, and I&apos;ll help you make it!</p>
              </div>
            </header>

            <BuildChat />
          </section>

          <section className={styles.previewPanel} aria-labelledby="preview-title">
            <BuildGamePreview
              {...GAME_PLAYER_CONTENT}
              initialGame={initialGame}
            />
          </section>
        </div>
      </BuildSetupProvider>
    </main>
  );
}
