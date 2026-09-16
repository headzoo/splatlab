import Link from "next/link";

import styles from "./site-legal-nav.module.css";

const COPYRIGHT_YEAR = 2026;

type SiteLegalNavProps = {
  tone?: "onLight" | "onDark";
  current?: "terms" | "privacy" | "team";
};

export function SiteLegalNav({ tone = "onLight", current }: SiteLegalNavProps) {
  return (
    <div className={`${styles.legalNav} ${styles[tone]}`}>
      <nav className={styles.links} aria-label="Footer">
        <Link href="/team" aria-current={current === "team" ? "page" : undefined}>
          Team
        </Link>
        <Link href="/terms" aria-current={current === "terms" ? "page" : undefined}>
          Terms of Use
        </Link>
        <Link href="/privacy" aria-current={current === "privacy" ? "page" : undefined}>
          Privacy Policy
        </Link>
      </nav>
      <small className={styles.copyright}>© {COPYRIGHT_YEAR} Splat Lab!</small>
    </div>
  );
}
