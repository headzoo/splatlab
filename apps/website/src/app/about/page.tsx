import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "../site-header";
import { AuthAction } from "../auth-flow";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "About Splat Lab! | Big Ideas Become Playable Games",
  description:
    "Meet Cooper and learn how Splat Lab helps kids turn imaginative ideas into playable games.",
};

type ProcessStep = {
  number: number;
  title: string;
  copy: string;
  tone: "yellow" | "purple" | "blue" | "pink" | "green";
  image?: string;
  glyph?: string;
};

const processSteps: ProcessStep[] = [
  {
    number: 1,
    title: "Idea",
    copy: "You imagine it. Anything is possible!",
    tone: "yellow",
    image: "/brand/homepage/icon-ideas.png",
  },
  {
    number: 2,
    title: "Build",
    copy: "Use simple tools and AI to make it.",
    tone: "purple",
    image: "/brand/homepage/icon-no-code.png",
  },
  {
    number: 3,
    title: "Play",
    copy: "Try your game instantly!",
    tone: "blue",
    glyph: "▶",
  },
  {
    number: 4,
    title: "Change",
    copy: "Tweak it, add new ideas, make it weirder!",
    tone: "pink",
    glyph: "⚙",
  },
  {
    number: 5,
    title: "Play Again",
    copy: "Keep creating, keep improving!",
    tone: "green",
    glyph: "↻",
  },
];

const reasons = [
  {
    title: "No coding required",
    copy: "Just ideas, imagination, and AI.",
    icon: "🎮",
    tone: "green",
  },
  {
    title: "Creative and playful",
    copy: "Bring your wildest ideas to life.",
    icon: "🎨",
    tone: "purple",
  },
  {
    title: "Fast to start",
    copy: "Go from idea to a playable game in minutes.",
    icon: "ϟ",
    tone: "blue",
  },
  {
    title: "Privacy-conscious",
    copy: "A safe, kid-friendly environment.",
    icon: "♥",
    tone: "pink",
  },
  {
    title: "Easy to share",
    copy: "Play with friends and show off your creations!",
    icon: "●●●",
    tone: "yellow",
  },
] as const;

const gameTypes = ["Platformer", "Top-down adventure", "Endless runner", "Maze"];

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

export default function AboutPage() {
  return (
    <main className={styles.page} id="main-content">
      <a className={styles.skipLink} href="#about-intro">
        Skip to about content
      </a>

      <section className={styles.hero} aria-labelledby="about-title">
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
        <SiteHeader currentPage="about" />

        <div className={styles.heroInner} id="about-intro">
          <div className={styles.heroCopy}>
            <div className={styles.titlePlaque}>
              <span>About</span>
              <h1 id="about-title">Splat Lab!</h1>
            </div>
            <h2>Big ideas become playable games.</h2>
            <p>
              Splat Lab! helps kids turn their ideas into real, playable games
              with the power of AI. No coding. Just imagination.
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
                <span>Ideas make a brighter</span>
                <strong>(and weirder) world!</strong>
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
          <section className={`${styles.panel} ${styles.process}`} aria-labelledby="process-title">
            <div className={styles.sectionHeading}>
              <h2 id="process-title">What is Splat Lab!?</h2>
              <p>A simple way to go from idea to a real game!</p>
            </div>

            <ol className={styles.processGrid}>
              {processSteps.map((step) => (
                <li className={`${styles.processCard} ${styles[step.tone]}`} key={step.title}>
                  <div className={styles.processIcon} aria-hidden="true">
                    {step.image ? (
                      <Image src={step.image} alt="" width={94} height={78} unoptimized />
                    ) : (
                      <span>{step.glyph}</span>
                    )}
                  </div>
                  <h3>
                    {step.number}. {step.title}
                  </h3>
                  <p>{step.copy}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.cooperSection} aria-labelledby="cooper-title">
            <Image
              className={styles.cooperBackdrop}
              src="/brand/homepage/hero-background.png"
              alt=""
              fill
              sizes="100vw"
              unoptimized
            />
            <div className={styles.cooperOverlay} />
            <div className={styles.cooperInner}>
              <div className={styles.cooperIntro}>
                <div className={styles.woodHeading}>
                  <span>Meet</span>
                  <h2 id="cooper-title">Cooper!</h2>
                </div>
                <p>
                  Cooper is our lab assistant, guide, and official crash-test subject.
                  He&apos;s here to inspire you, cheer you on, and remind you that the
                  weirdest ideas often make the best games!
                </p>
              </div>

              <div className={styles.cooperPortrait}>
                <Image
                  src="/brand/homepage/cooper-hero.png"
                  alt="Cooper waving in his well-used lab coat"
                  width={1032}
                  height={1190}
                  unoptimized
                />
              </div>

              <div className={styles.cooperSide}>
                <div className={styles.rulesCard}>
                  <h3>Cooper&apos;s Rules:</h3>
                  <ul>
                    <li>Be curious</li>
                    <li>Try silly ideas</li>
                    <li>Make mistakes</li>
                    <li>Keep creating</li>
                    <li>Have fun!</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.reasons}`} aria-labelledby="reasons-title">
            <div className={styles.sectionHeading}>
              <h2 id="reasons-title">Why kids (and parents) like it</h2>
            </div>
            <div className={styles.reasonGrid}>
              {reasons.map((reason) => (
                <article className={`${styles.reasonCard} ${styles[reason.tone]}`} key={reason.title}>
                  <span className={styles.reasonIcon} aria-hidden="true">
                    {reason.icon}
                  </span>
                  <h3>{reason.title}</h3>
                  <p>{reason.copy}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={`${styles.panel} ${styles.showcase}`} aria-labelledby="showcase-title">
            <div className={styles.showcaseGrid}>
              <div className={styles.showcaseCopy}>
                <h2 id="showcase-title">Real ideas. Real games.</h2>
                <p>
                  From a simple idea to a playable game — in just a few clicks.
                  Splat Lab! makes game creation easy, fun, and accessible for everyone.
                </p>
                <Link className={styles.tryLink} href="/#examples">
                  Try It Now <span aria-hidden="true">→</span>
                </Link>
              </div>

              <div className={styles.builderMock} aria-label="Example Splat Lab game builder">
                <div className={styles.mockHeader}>
                  <Image
                    src="/brand/homepage/cooper-hero.png"
                    alt=""
                    width={1032}
                    height={1190}
                    unoptimized
                  />
                  <strong>Build with Cooper</strong>
                </div>
                <p className={styles.chatPrompt}>What do you want to make?</p>
                <div className={styles.gameTypeGrid}>
                  {gameTypes.map((gameType, index) => (
                    <span className={index === 0 ? styles.selectedGameType : ""} key={gameType}>
                      <b aria-hidden="true">{["🎮", "▦", "➜", "▣"][index]}</b>
                      {gameType}
                    </span>
                  ))}
                </div>
                <p className={styles.chatReply}>
                  Awesome choice! Let&apos;s make something great!
                </p>
              </div>

              <div className={styles.previewMock} aria-label="Example playable game preview">
                <div className={styles.previewHeader}>
                  <strong>🎮 Game Preview</strong>
                  <span>LIVE</span>
                </div>
                <Image
                  src="/brand/homepage/game-chicken-quest.png"
                  alt="A colorful platform game made in Splat Lab"
                  width={238}
                  height={130}
                  unoptimized
                />
                <p>Games start with good ideas! ☺</p>
              </div>
            </div>
          </section>
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
