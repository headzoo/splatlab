import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";
import { AuthAction } from "./auth-flow";

type SiteHeaderProps = {
  currentPage?: "about" | "parents";
};

function NavIcon({ name }: { name: "features" | "examples" | "parents" | "about" }) {
  if (name === "features") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M7 8h10c2 0 3.2 1.2 3.7 3.1l1 4.1c.5 2-1.9 3.4-3.3 2l-2.1-2.1H7.7l-2.1 2.1c-1.4 1.4-3.8 0-3.3-2l1-4.1C3.8 9.2 5 8 7 8Z" />
        <path d="M7 11v4M5 13h4" />
        <circle cx="17" cy="12" r=".8" />
        <circle cx="19" cy="14" r=".8" />
      </svg>
    );
  }

  if (name === "examples") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect x="3.5" y="5" width="17" height="14" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.3" />
        <path d="m5.5 17 4.2-4 3.1 2.8 2.2-2 3.5 3.2" />
      </svg>
    );
  }

  if (name === "parents") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="2.7" />
        <circle cx="6.2" cy="10" r="2" />
        <circle cx="17.8" cy="10" r="2" />
        <path d="M7.2 18c.4-3.1 2-4.8 4.8-4.8s4.4 1.7 4.8 4.8M2.8 18c.2-2.4 1.4-3.7 3.5-3.7M21.2 18c-.2-2.4-1.4-3.7-3.5-3.7" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m12 3 2.6 5.3 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8L12 3Z" />
    </svg>
  );
}

export function SiteHeader({ currentPage }: SiteHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.navbarShell}>
        <Link className={styles.brand} href="/" aria-label="Splat Lab home">
          <Image
            src="/brand/site-header-logo.png"
            alt="Splat Lab!"
            width={2067}
            height={634}
            priority
            unoptimized
          />
        </Link>

        <nav className={styles.nav} aria-label="Primary navigation">
          <Link href="/#features"><NavIcon name="features" />Features</Link>
          <Link href="/#examples"><NavIcon name="examples" />Examples</Link>
          <Link
            href="/parents"
            aria-current={currentPage === "parents" ? "page" : undefined}
          >
            <NavIcon name="parents" />For Parents
          </Link>
          <Link href="/about" aria-current={currentPage === "about" ? "page" : undefined}>
            <NavIcon name="about" />About
          </Link>
        </nav>
      </div>

      <div className={styles.accountLinks}>
        <AuthAction
          className={styles.signIn}
          mode="sign-in"
          signedInMode="sign-out"
          signedInChildren="Sign out"
        >
          Sign in
        </AuthAction>
        <AuthAction
          className={styles.headerCta}
          mode="start"
          signedInChildren="Go to Lab"
        >
          Get Started
        </AuthAction>
      </div>
    </header>
  );
}
