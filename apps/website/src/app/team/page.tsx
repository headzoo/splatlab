import type { Metadata } from "next";
import Image from "next/image";
import { SiteHeader } from "../site-header";
import { SiteLegalNav } from "../site-legal-nav";
import { AuthAction } from "../auth-flow";
import styles from "./team.module.css";

export const metadata: Metadata = {
  title: "Team | Splat Lab!",
  description:
    "Meet Cooper and the Splat Lab crew: Rupert, Jamie, Vix, Lango, and Leenie.",
};

const members = [
  {
    kicker: "Lab assistant",
    title: "Cooper",
    copy: [
      "He works at the lab. He is also, somehow, the lab's guinea pig.",
      "He helps kids build games, then personally tests every ridiculous idea they invent.",
      "Cheerful, battle-tested, and first in line when the cannon needs a volunteer.",
    ],
    quote: "Should we test it?",
    image: "/brand/team/cooper.png",
    width: 1024,
    height: 1024,
    alt: "Cooper in his hillside lab, holding a bubbling flask beside a wooden Cooper sign that says Should we test it?",
  },
  {
    kicker: "The fixer",
    title: "Rupert",
    copy: [
      "If something on the hill is broken, dark, sparking, or making a noise it definitely shouldn't be making, somebody has probably already called him.",
      "He brings tools, spare cables, bad jokes, and usually the fix.",
    ],
    quote: "I'll be there in ten.",
    image: "/brand/team/rupert.png",
    width: 1208,
    height: 1302,
    alt: "Rupert the hillside fixer, with a tool bag, keys, and a wooden sign that says I'll be there in ten.",
  },
  {
    kicker: "The planner",
    title: "Jamie",
    copy: [
      "Builder by day. Trader by night.",
      "He measures twice, checks the chart three times, and somehow already knows how this is going to play out.",
      "While the rest of the crew improvises, Jamie has a plan.",
    ],
    quote: "Frames houses by day. Frames trades by night.",
    image: "/brand/team/jamie.png",
    width: 1208,
    height: 1302,
    alt: "Jamie on a construction frame, holding blueprints and a laptop beside a wooden Jamie sign.",
  },
  {
    kicker: "Trouble with a plan",
    title: "Vix",
    copy: [
      "You didn't see her come in.",
      "You probably won't see her leave.",
      "She likes shortcuts, locked doors, bad ideas, and knowing where the exit is before anyone else realizes they need one.",
    ],
    quote: "Wasn't here.",
    image: "/brand/team/vix.png",
    width: 1208,
    height: 1302,
    alt: "Vix the fox leaning on a fire escape at night, beside a wooden sign that says Wasn't here.",
  },
  {
    kicker: "Full send",
    title: "Lango",
    copy: [
      "No fancy rig. No degree. No excuses.",
      "Give him a beat-up laptop, an idea, and a problem everyone else called impossible, and he'll disappear for the night.",
      "By morning, something works that didn't before.",
    ],
    quote: "Build. Break. Fix. Repeat. Full send.",
    image: "/brand/team/lango.png",
    width: 1208,
    height: 1302,
    alt: "Lango perched on a crate with a beat-up laptop in a late-night workshop.",
  },
  {
    kicker: "Big heart",
    title: "Leenie",
    copy: [
      "She likes cute outfits, perfect hair, being noticed, and pretending she doesn't care what anyone thinks.",
      "She can be a little dramatic. Maybe a little snobby.",
      "But when somebody really needs her, the attitude disappears.",
    ],
    quote: "Pretty on the outside. Big heart underneath.",
    image: "/brand/team/leenie.png",
    width: 1208,
    height: 1302,
    alt: "Leenie in a pink cardigan and plaid skirt by lockers, holding a heart-shaped mirror.",
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

export default function TeamPage() {
  return (
    <main className={styles.page} id="main-content">
      <a className={styles.skipLink} href="#team-intro">
        Skip to team
      </a>

      <section className={styles.hero} aria-labelledby="team-title">
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
        <SiteHeader />

        <div className={styles.heroInner} id="team-intro">
          <div className={styles.heroCopy}>
            <div className={styles.titlePlaque}>
              <span>Team</span>
              <h1 id="team-title">Splat Lab!</h1>
            </div>
            <h2>Meet the crew that keeps the hill running.</h2>
            <p>
              Cooper and his friends help kids invent games, fix the unexpected,
              and test every ridiculous idea.
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
                <span>Should we</span>
                <strong>test it?</strong>
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
          {members.map((member, index) => {
            const reverse = index % 2 === 1;

            return (
              <section
                className={`${styles.panel} ${styles.feature}`}
                aria-labelledby={`member-${index}-title`}
                key={member.title}
              >
                <div
                  className={`${styles.featureRow}${
                    reverse ? ` ${styles.featureRowReverse}` : ""
                  }`}
                >
                  <div className={styles.featureCopy}>
                    <span className={styles.featureKicker}>{member.kicker}</span>
                    <h2 id={`member-${index}-title`}>{member.title}</h2>
                    {member.copy.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    <p className={styles.featureQuote}>“{member.quote}”</p>
                  </div>
                  <div className={styles.featureShots}>
                    <figure className={styles.featureShot}>
                      <Image
                        src={member.image}
                        alt={member.alt}
                        width={member.width}
                        height={member.height}
                        unoptimized
                      />
                    </figure>
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
            <SiteLegalNav current="team" />
          </div>
        </div>
      </footer>
    </main>
  );
}
