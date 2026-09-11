import Image from "next/image";
import styles from "./page.module.css";

const benefits = [
  {
    title: "Bring Ideas to Life",
    copy: "Describe what you want and watch it become a real game.",
    image: "/brand/homepage/icon-ideas.png",
    width: 110,
    height: 94,
  },
  {
    title: "Play Online",
    copy: "Share your games and play with 1-4 friends, right in your browser.",
    image: "/brand/homepage/icon-online.png",
    width: 170,
    height: 94,
  },
  {
    title: "No Coding Needed",
    copy: "Just creativity. Splat Lab handles the technical stuff.",
    image: "/brand/homepage/icon-no-code.png",
    width: 120,
    height: 94,
  },
  {
    title: "Made for Kids",
    copy: "A safe, fun, and friendly place to learn, create, and play.",
    image: "/brand/homepage/icon-kids.png",
    width: 120,
    height: 94,
  },
] as const;

const games = [
  {
    title: "Chicken Quest",
    creator: "Alex, age 10",
    likes: 243,
    image: "/brand/homepage/game-chicken-quest.png",
    width: 238,
  },
  {
    title: "Astro Slimes",
    creator: "Priya, age 11",
    likes: 189,
    image: "/brand/homepage/game-astro-slimes.png",
    width: 238,
  },
  {
    title: "Penguin Panic",
    creator: "Mateo, age 9",
    likes: 312,
    image: "/brand/homepage/game-penguin-panic.png",
    width: 238,
  },
  {
    title: "Dragon's Lair",
    creator: "Sam, age 12",
    likes: 276,
    image: "/brand/homepage/game-dragons-lair.png",
    width: 239,
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

function CtaLink({ className = "" }: { className?: string }) {
  return (
    <a className={`${styles.cta} ${className}`} href="#examples">
      Start Creating Free <span aria-hidden="true">→</span>
    </a>
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
          src="/brand/homepage/hero-background.png"
          alt=""
          fill
          priority
          sizes="100vw"
          unoptimized
        />

        <header className={styles.header}>
          <a className={styles.brand} href="#main-content" aria-label="Splat Lab home">
            <Image
              src="/brand/homepage/splat-lab-logo.png"
              alt="Splat Lab!"
              width={1254}
              height={1254}
              priority
              unoptimized
            />
          </a>

          <nav className={styles.nav} aria-label="Primary navigation">
            <a href="#features">Features</a>
            <a href="#examples">Examples</a>
            <a href="#parents">For Parents</a>
            <a href="#pricing">Pricing</a>
          </nav>

          <div className={styles.accountLinks}>
            <a className={styles.signIn} href="#get-started">
              Sign In
            </a>
            <a className={styles.headerCta} href="#get-started">
              Get Started Free
            </a>
          </div>
        </header>

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
            <CtaLink className={styles.heroCta} />
            <small>No credit card required.</small>
          </div>

          <div className={styles.heroCharacter}>
            <div className={styles.speechBubble}>
              <strong>BIG IDEAS</strong>
              make the best games!
              <span aria-hidden="true">☺</span>
            </div>
            <Image
              className={styles.cooper}
              src="/brand/homepage/cooper-hero.png"
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
              <Image
                className={styles.gameImage}
                src={game.image}
                alt={`Preview of ${game.title}`}
                width={game.width}
                height={130}
                unoptimized
              />
              <div className={styles.gameTitleRow}>
                <h3>{game.title}</h3>
                <span className={styles.likes} aria-label={`${game.likes} likes`}>
                  <span aria-hidden="true">♥</span> {game.likes}
                </span>
              </div>
              <p>by {game.creator}</p>
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
            <CtaLink />
            <small>No credit card required.</small>
          </div>
          <p className={`${styles.footerNote} ${styles.footerNoteRight}`}>
            Silly ideas.<br />Serious fun.
          </p>
        </div>
      </footer>
    </main>
  );
}
