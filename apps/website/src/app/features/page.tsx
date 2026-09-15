import type { Metadata } from "next";
import Image from "next/image";
import { SiteHeader } from "../site-header";
import { AuthAction } from "../auth-flow";
import styles from "./features.module.css";

export const metadata: Metadata = {
  title: "Features | Splat Lab!",
  description:
    "See the tools kids actually use in Splat Lab: chat with Cooper, the game builder, the player, screenshots, and My Lab.",
};

const features = [
  {
    kicker: "The chat box",
    title: "Chat with Cooper",
    copy: "Tell Cooper what you want to make. He asks simple questions, offers wild ideas, and helps turn a spark into a real game.",
    image: "/brand/features/chat.png",
    width: 651,
    height: 772,
    alt: "The Build with Cooper chat, showing character choices, game-name buttons, and idea chips.",
  },
  {
    kicker: "The builder",
    title: "Paint, place, and preview",
    copy: "The live preview is your game. Paint terrain, drop coins and enemies, then hit play to try it instantly — no coding required.",
    image: "/brand/features/builder.png",
    width: 937,
    height: 880,
    alt: "The Splat Lab builder preview for Cooper's Hill Hop, with map tools, terrain, and objects.",
  },
  {
    kicker: "The game player",
    title: "Play in the browser",
    copy: "Open a share link and jump in. Kids can play their games full screen, invite friends, and keep tweaking until it feels just right.",
    image: "/brand/features/player.png",
    width: 1180,
    height: 789,
    alt: "The public game player for Cooper's Hill Hop, with the platformer running in the browser.",
  },
  {
    kicker: "Screenshots",
    title: "Save the funniest moments",
    copy: "Right-click a game, tap Screenshot, and keep the still in My Media. Share a snapshot of a big jump, a boss battle, or a totally silly idea.",
    image: "/brand/features/screenshot-menu.png",
    width: 1180,
    height: 789,
    alt: "A playing Splat Lab game with the Screenshot action menu open over the canvas.",
    extraImage: {
      src: "/brand/features/media-library.png",
      width: 1280,
      height: 494,
      alt: "The My Media library in Lab, showing a saved screenshot from Cooper's Hill Hop.",
    },
  },
  {
    kicker: "My Lab",
    title: "Your invention table",
    copy: "Every game lives in My Lab. Come back with a Lab Key, open a project, and keep building from where you left off.",
    image: "/brand/features/lab.png",
    width: 1280,
    height: 544,
    alt: "The My Games workspace in Lab, with a Cooper's Hill Hop project card and a Create a Game button.",
  },
] as const;

function CtaLink({
  className = "",
  signedInChildren,
}: {
  className?: string;
  signedInChildren?: string;
}) {
  return (
    <AuthAction
      className={`${styles.cta} ${className}`}
      mode="start"
      signedInChildren={signedInChildren}
    >
      Start Creating Free <span aria-hidden="true">→</span>
    </AuthAction>
  );
}

export default function FeaturesPage() {
  return (
    <main className={styles.page} id="main-content">
      <a className={styles.skipLink} href="#features-intro">
        Skip to features
      </a>

      <section className={styles.hero} aria-labelledby="features-title">
        <Image
          className={styles.heroBackground}
          src="/brand/parents/parents-hero-background.png"
          alt=""
          fill
          priority
          sizes="100vw"
          unoptimized
        />
        <div className={styles.heroShade} />
        <div className={styles.heroSeam} aria-hidden="true" />
        <SiteHeader currentPage="features" />

        <div className={styles.heroInner} id="features-intro">
          <div className={styles.heroCopy}>
            <div className={styles.titlePlaque}>
              <span>Features</span>
              <h1 id="features-title">Splat Lab!</h1>
            </div>
            <h2>See the tools kids actually use to make a game.</h2>
            <p>
              Chat with Cooper, paint a map, play in the browser, and save
              screenshots of the funniest moments.
            </p>
            <CtaLink className={styles.heroCta} />
          </div>

          <div className={styles.heroCharacter}>
            <div className={styles.speechBubble}>
              <svg
                className={styles.speechBubbleShape}
                viewBox="0 0 220 174"
                aria-hidden="true"
              >
                <path d="M110 5C52 5 8 30 8 72C8 106 39 131 84 137L68 166L109 139C168 139 212 113 212 72C212 30 168 5 110 5Z" />
              </svg>
              <div className={styles.speechBubbleCopy}>
                <span>Try the silly idea</span>
                <strong>first!</strong>
                <span className={styles.speechBubbleSmile} aria-hidden="true">
                  ☺
                </span>
              </div>
            </div>
            <Image
              className={styles.cooperHero}
              src="/brand/features/cooper-hero.png"
              alt="Cooper, Splat Lab's enthusiastic chicken scientist"
              width={1399}
              height={1124}
              priority
              unoptimized
            />
          </div>
        </div>
      </section>

      <div className={styles.contentStage}>
        <div className={styles.kingdomClip} aria-hidden="true">
          <div className={styles.kingdomBackdrop} />
        </div>
        <div className={styles.contentBackdrop}>
          {features.map((feature, index) => {
            const reverse = index % 2 === 1;
            const extraImage = "extraImage" in feature ? feature.extraImage : null;

            return (
              <section
                className={`${styles.panel} ${styles.feature}`}
                aria-labelledby={`feature-${index}-title`}
                key={feature.title}
              >
                <div
                  className={`${styles.featureRow}${
                    reverse ? ` ${styles.featureRowReverse}` : ""
                  }`}
                >
                  <div className={styles.featureCopy}>
                    <span className={styles.featureKicker}>{feature.kicker}</span>
                    <h2 id={`feature-${index}-title`}>{feature.title}</h2>
                    <p>{feature.copy}</p>
                  </div>
                  <div className={styles.featureShots}>
                    <figure className={styles.featureShot}>
                      <Image
                        src={feature.image}
                        alt={feature.alt}
                        width={feature.width}
                        height={feature.height}
                        unoptimized
                      />
                    </figure>
                    {extraImage ? (
                      <figure className={styles.featureShot}>
                        <Image
                          src={extraImage.src}
                          alt={extraImage.alt}
                          width={extraImage.width}
                          height={extraImage.height}
                          unoptimized
                        />
                      </figure>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <footer className={styles.finalCta}>
        <Image
          className={styles.finalBackground}
          src="/brand/parents/parents-footer-background-with-signs.png"
          alt=""
          fill
          sizes="100vw"
          unoptimized
        />
        <div className={styles.finalWash} />
        <div className={styles.finalInner}>
          <div className={styles.finalCooper}>
            <Image
              src="/brand/features/cooper-hero.png"
              alt="Cooper cheering with his wings spread"
              width={1399}
              height={1124}
              unoptimized
            />
          </div>
          <div className={styles.finalCopy}>
            <h2>Let their ideas take flight!</h2>
            <p>Give your child the tools to imagine, create, and play with Splat Lab!</p>
            <CtaLink signedInChildren="Go to Lab" />
          </div>
        </div>
      </footer>
    </main>
  );
}
