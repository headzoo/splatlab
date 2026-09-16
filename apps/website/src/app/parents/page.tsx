import type { Metadata } from "next";
import Image from "next/image";
import { AuthAction } from "../auth-flow";
import { SiteHeader } from "../site-header";
import { SiteLegalNav } from "../site-legal-nav";
import styles from "./parents.module.css";

export const metadata: Metadata = {
  title: "For Parents | Splat Lab!",
  description:
    "See how Splat Lab gives kids a playful, privacy-conscious way to turn their ideas into games.",
};

const highlights = [
  {
    icon: "💡",
    title: "Creativity first",
    copy: "Kids dream it, design it, and make it real.",
    tone: "yellow",
  },
  {
    icon: "🎮",
    title: "No coding needed",
    copy: "Simple choices and AI-powered tools do the heavy lifting.",
    tone: "purple",
  },
  {
    icon: "⭐",
    title: "Constructive screen time",
    copy: "Turns playtime into creativity, problem-solving, and learning.",
    tone: "blue",
  },
  {
    icon: "🛡️",
    title: "Kid-friendly design",
    copy: "A safe, supportive space built for kids.",
    tone: "pink",
  },
  {
    icon: "🧑‍🤝‍🧑",
    title: "Easy sharing with friends",
    copy: "Let kids play and share their games with friends and family.",
    tone: "yellow",
  },
] as const;

const parentBenefits = [
  {
    icon: "⚡",
    title: "Kids see results quickly",
    copy: "They can make a playable game in just minutes.",
    tone: "yellow",
  },
  {
    icon: "👑",
    title: "They feel ownership",
    copy: "Kids are proud of what they make and excited to share it.",
    tone: "purple",
  },
  {
    icon: "🧪",
    title: "Encourages experimentation",
    copy: "Try ideas, make mistakes, and keep improving!",
    tone: "green",
  },
  {
    icon: "👨‍👩‍👧‍👦",
    title: "Play with 1–4 friends",
    copy: "Multiplayer games are easy to create and fun to play.",
    tone: "yellow",
  },
  {
    icon: "🚀",
    title: "Simple to start",
    copy: "No coding, no complex tools — just a few clicks and you’re on your way!",
    tone: "blue",
  },
] as const;

const privacyPoints = [
  "No public social profile needed",
  "Privacy-conscious by design",
  "Simple, parent-friendly sharing",
  "Unlisted, link-based game sharing",
  "A safe and positive environment",
  "Built for kids, not ads",
] as const;

const steps = [
  { icon: "💡", title: "1. Idea", copy: "You imagine it. Anything is possible!", tone: "yellow" },
  { icon: "🔨", title: "2. Build", copy: "Use simple tools and AI to make it.", tone: "purple" },
  { icon: "▶", title: "3. Play", copy: "Try your game instantly!", tone: "green" },
  { icon: "⚙", title: "4. Change", copy: "Tweak it, add new ideas, make it weirder!", tone: "pink" },
  { icon: "↻", title: "5. Play Again", copy: "Keep creating, keep improving!", tone: "green" },
] as const;

const games = [
  {
    title: "Dragon Dash",
    copy: "A platformer adventure!",
    image: "/brand/homepage/game-dragons-lair.png",
  },
  {
    title: "Star Jumper",
    copy: "Collect, explore, and fly!",
    image: "/brand/homepage/game-astro-slimes.png",
  },
  {
    title: "Penguin Slide",
    copy: "A chilly challenge!",
    image: "/brand/homepage/game-penguin-panic.png",
  },
  {
    title: "Castle Quest",
    copy: "Magic, puzzles, and fun!",
    image: "/brand/homepage/game-chicken-quest.png",
  },
] as const;

const testimonials = [
  {
    avatar: "👩🏻",
    quote:
      "My 8-year-old made a game in less than 10 minutes and couldn’t stop showing it to everyone!",
    author: "Sarah M.",
  },
  {
    avatar: "👨🏽",
    quote:
      "Splat Lab! is the perfect mix of fun and creativity. My kids are learning without even realizing it.",
    author: "James T.",
  },
  {
    avatar: "👩🏾",
    quote:
      "I love that it’s safe, simple, and lets my kids be imaginative. They feel proud of what they create!",
    author: "Priya K.",
  },
] as const;

function StartButton({ className = "" }: { className?: string }) {
  return (
    <AuthAction
      className={`${styles.cta} ${className}`}
      mode="start"
      signedInChildren="Go to Lab"
    >
      Start Creating Free <span aria-hidden="true">→</span>
    </AuthAction>
  );
}

export default function ParentsPage() {
  return (
    <main className={styles.page} id="main-content">
      <a className={styles.skipLink} href="#parents-intro">
        Skip to parent information
      </a>

      <section className={styles.hero} aria-labelledby="parents-title">
        <Image
          className={styles.heroBackground}
          src="/brand/parents/parents-hero-background.png"
          alt=""
          fill
          priority
          sizes="100vw"
          unoptimized
        />
        <div className={styles.heroWash} />
        <div className={styles.heroSeam} aria-hidden="true" />
        <SiteHeader currentPage="parents" />

        <div className={styles.heroInner} id="parents-intro">
          <div className={styles.heroCooper}>
            <span className={styles.ideaBurst} aria-hidden="true">✦</span>
            <Image
              src="/brand/parents/parents-hero-cooper.png"
              alt="Cooper giving parents a friendly thumbs-up"
              width={1337}
              height={1176}
              priority
              unoptimized
            />
          </div>

          <div className={styles.heroCopy}>
            <h1 id="parents-title">A playful way for kids<br />{" "}to turn ideas into games.</h1>
            <p>
              Splat Lab! helps kids create and play their own games with no coding.
              With simple tools, guided choices, and a little help from AI, big ideas
              become real, playable games!
            </p>
            <StartButton className={styles.heroCta} />
          </div>

        </div>
      </section>

      <div className={styles.contentStage}>
        <div className={styles.kingdomClip} aria-hidden="true">
          <div className={styles.kingdomBackdrop} />
        </div>
        <div className={styles.contentBackdrop}>
        <section className={`${styles.panel} ${styles.highlights}`} aria-labelledby="highlights-title">
          <div className={styles.sectionHeading}>
            <h2 id="highlights-title"><span aria-hidden="true">✎</span> Great things happen here!</h2>
            <p>Splat Lab! gives kids the tools to be creative, curious, and confident.</p>
          </div>
          <div className={styles.fiveGrid}>
            {highlights.map((item) => (
              <article className={`${styles.infoCard} ${styles[item.tone]}`} key={item.title}>
                <span className={styles.cardIcon} aria-hidden="true">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <div className={styles.splitRow}>
          <section className={`${styles.panel} ${styles.parentReasons}`} aria-labelledby="parent-reasons-title">
            <div className={styles.sectionHeading}>
              <h2 id="parent-reasons-title"><span aria-hidden="true">⚙</span> Why parents like Splat Lab! <i>♥</i></h2>
              <p>Real creativity. Real confidence. Real fun.</p>
            </div>
            <div className={styles.parentBenefitGrid}>
              {parentBenefits.map((item) => (
                <article className={`${styles.infoCard} ${styles.compactCard} ${styles[item.tone]}`} key={item.title}>
                  <span className={styles.cardIcon} aria-hidden="true">{item.icon}</span>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={`${styles.panel} ${styles.privacy}`} aria-labelledby="privacy-title">
            <div className={styles.sectionHeading}>
              <h2 id="privacy-title"><span aria-hidden="true">🔒</span> Privacy and safety</h2>
              <p>Designed with kids (and parents) in mind.</p>
            </div>
            <ul>
              {privacyPoints.map((point) => <li key={point}>{point}</li>)}
            </ul>
            <div className={styles.safetySign} aria-hidden="true">
              KIDS<br />CREATE<br />SAFELY<br />HERE ☺
            </div>
          </section>
        </div>

        <section className={`${styles.panel} ${styles.process}`} aria-labelledby="process-title">
          <div className={styles.sectionHeading}>
            <h2 id="process-title"><span aria-hidden="true">⚙</span> How it works</h2>
            <p>From idea to a real game — it’s that easy!</p>
          </div>
          <ol className={styles.stepGrid}>
            {steps.map((step, index) => (
              <li className={`${styles.infoCard} ${styles.stepCard} ${styles[step.tone]}`} key={step.title}>
                <span className={styles.cardIcon} aria-hidden="true">{step.icon}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
                {index < steps.length - 1 && <b className={styles.stepArrow} aria-hidden="true">→</b>}
              </li>
            ))}
          </ol>
          <p className={styles.stickyNote}>SAME IDEA<br />DIFFERENT GAME<br />THAT’S THE FUN! ☺</p>
        </section>

        <section className={`${styles.panel} ${styles.gameSection}`} aria-labelledby="games-title">
          <div className={styles.sectionHeading}>
            <h2 id="games-title"><span aria-hidden="true">🎮</span> What kids can make</h2>
            <p>Real games made by real kids on Splat Lab!</p>
          </div>
          <div className={styles.gameGrid}>
            {games.map((game) => (
              <article className={styles.gameCard} key={game.title}>
                <Image src={game.image} alt={`Preview of ${game.title}`} width={238} height={130} unoptimized />
                <div><h3>{game.title}</h3><p>{game.copy}</p></div>
              </article>
            ))}
            <p className={styles.kidsNote} aria-hidden="true">KIDS<br />MAKE<br />AMAZING<br />GAMES! ☺</p>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.testimonialSection}`} aria-labelledby="testimonials-title">
          <div className={styles.sectionHeading}>
            <h2 id="testimonials-title"><span aria-hidden="true">♥</span> What parents are saying</h2>
            <p>Real families. Real feedback.</p>
          </div>
          <div className={styles.testimonialGrid}>
            {testimonials.map((testimonial) => (
              <figure className={styles.testimonial} key={testimonial.author}>
                <span className={styles.avatar} aria-hidden="true">{testimonial.avatar}</span>
                <div>
                  <blockquote>“{testimonial.quote}”</blockquote>
                  <figcaption>{testimonial.author} <span aria-label="Five out of five stars">★★★★★</span></figcaption>
                </div>
              </figure>
            ))}
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
            <StartButton />
            <SiteLegalNav />
          </div>
        </div>
      </footer>
    </main>
  );
}
