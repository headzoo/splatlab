import Image from "next/image";
import styles from "./page.module.css";
import { SiteHeader } from "./site-header";
import { AuthAction } from "./auth-flow";
import { HeroParallax } from "./hero-parallax";

const benefits = [
  {
    title: "Bring Ideas to Life",
    copy: "Describe what you want and watch it become a real game.",
    image: "/brand/homepage/icon-ideas.png",
    width: 150,
    height: 88,
  },
  {
    title: "Play Online",
    copy: "Share your games and play with 1-4 friends, right in your browser.",
    image: "/brand/homepage/icon-online.png",
    width: 150,
    height: 88,
  },
  {
    title: "No Coding Needed",
    copy: "Just creativity. Splat Lab handles the technical stuff.",
    image: "/brand/homepage/icon-no-code.png",
    width: 150,
    height: 88,
  },
  {
    title: "Made for Kids",
    copy: "A safe, fun, and friendly place to learn, create, and play.",
    image: "/brand/homepage/icon-kids.png",
    width: 150,
    height: 88,
  },
] as const;

const games = [
  {
    title: "Meadow Coin Quest",
    href: "https://splatlab.games/play/cmu0hdkqc000104jnc9od9t8c",
    image: "/brand/homepage/game-meadow-coin-quest.webp",
  },
  {
    title: "Cooper's Ghost Quest",
    href: "https://splatlab.games/play/cmu06onhe000004l5djp754cv",
    image: "/brand/homepage/game-coopers-ghost-quest.webp",
  },
  {
    title: "Cooper's Star Mission",
    href: "https://splatlab.games/play/cmu07vdyc000004l404jcm0wj",
    image: "/brand/homepage/game-coopers-star-mission.webp",
  },
  {
    title: "Dragon Cooper Jump",
    href: "https://splatlab.games/play/cmu0h41ng000004jn4er6ro6a",
    image: "/brand/homepage/game-dragon-cooper-jump.webp",
  },
] as const;

const testimonials = [
  {
    quote: "I made a game with my brother in like 10 minutes! It was so cool!",
    author: "Jayden, age 9",
    color: "blue",
  },
  {
    quote: "I love that I can share my games and play with my friends. It's like a superpower!",
    author: "Emma, age 11",
    color: "yellow",
  },
  {
    quote: "Splat Lab! makes game making easy and fun. I've already made 5 games!",
    author: "Noah, age 10",
    color: "pink",
  },
] as const;

function CtaButton({ className = "" }: { className?: string }) {
  return (
    <AuthAction className={`${styles.cta} ${className}`} mode="start">
      Start Creating Free <span aria-hidden="true">→</span>
    </AuthAction>
  );
}

export default function Home() {
  return (
    <main id="main-content">
      <a className={styles.skipLink} href="#features">
        Skip to features
      </a>

      <section className={styles.hero} aria-labelledby="hero-title">
        <Image
          className={styles.heroBackground}
          src="/brand/homepage/hero-background-clean.png"
          alt=""
          fill
          priority
          sizes="100vw"
          unoptimized
        />

        <HeroParallax />

        <SiteHeader />

        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <h1 id="hero-title">
              Make Games.
              <span>So Much Fun.</span>
            </h1>
            <p>
              Splat Lab! helps kids turn their ideas into playable games with
              the power of AI. No coding. Just imagination.
            </p>
            <CtaButton className={styles.heroCta} />
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
                <strong>BIG IDEAS</strong>
                <span>
                  make the best
                  <br />
                  games!
                </span>
                <span className={styles.speechBubbleSmile} aria-hidden="true">
                  ☺
                </span>
              </div>
            </div>
            <Image
              className={styles.cooper}
              src="/brand/homepage/cooper-hero-fixed.png"
              alt="Cooper, Splat Lab's enthusiastic chicken scientist"
              width={1032}
              height={1190}
              priority
              unoptimized
            />
          </div>
        </div>
      </section>

      <section className={styles.features} id="features" aria-label="Why Splat Lab">
        <div className={styles.featureGrid}>
          {benefits.map((benefit) => (
            <article className={styles.feature} key={benefit.title}>
              <div className={styles.featureIcon}>
                <Image
                  src={benefit.image}
                  alt=""
                  width={benefit.width}
                  height={benefit.height}
                  unoptimized
                />
              </div>
              <h2>{benefit.title}</h2>
              <p>{benefit.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.examples} id="examples" aria-labelledby="examples-title">
        <div className={styles.sectionHeading}>
          <h2 id="examples-title">Real Games. Real Imagination.</h2>
          <p>Check out what kids are making with Splat Lab!</p>
          <span className={styles.kidNote} aria-hidden="true">
            Made by
            <br />
            real kids! ↙
          </span>
        </div>

        <div className={styles.gameGrid}>
          {games.map((game) => (
            <article className={styles.gameCard} key={game.title}>
              <a className={styles.gameCardLink} href={game.href}>
                <Image
                  className={styles.gameImage}
                  src={game.image}
                  alt={`Preview of ${game.title}`}
                  width={720}
                  height={403}
                  unoptimized
                />
                <div className={styles.gameTitleRow}>
                  <h3>{game.title}</h3>
                  <span className={styles.playGame}>
                    Play <span aria-hidden="true">→</span>
                  </span>
                </div>
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.parents} id="parents" aria-label="Creator reviews">
        <div className={styles.testimonialGrid}>
          {testimonials.map((testimonial) => (
            <figure
              className={`${styles.testimonial} ${styles[testimonial.color]}`}
              key={testimonial.author}
            >
              <blockquote>“{testimonial.quote}”</blockquote>
              <figcaption>— {testimonial.author}</figcaption>
            </figure>
          ))}
        </div>

        <div className={styles.rating}>
          <span className={styles.stars} aria-label="Five out of five stars">
            ★★★★★
          </span>
          <strong>4.9/5</strong>
          <p>Loved by young creators (and their parents!)</p>
        </div>
      </section>

      <footer className={styles.footer} id="get-started">
        <span className={styles.anchorTarget} id="pricing" />
        <div className={styles.footerInner}>
          <p className={styles.footerNote}>Ideas today.<br />Games tomorrow.</p>
          <div className={styles.footerAction}>
            <CtaButton />
          </div>
          <p className={`${styles.footerNote} ${styles.footerNoteRight}`}>
            Silly ideas.<br />Serious fun.
          </p>
        </div>
      </footer>
    </main>
  );
}
