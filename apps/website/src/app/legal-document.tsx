import type { ReactNode } from "react";

import styles from "./legal.module.css";
import { SiteHeader } from "./site-header";
import { SiteLegalNav } from "./site-legal-nav";

export function LegalDocument({
  title,
  children,
  current,
}: {
  title: string;
  children: ReactNode;
  current: "terms" | "privacy";
}) {
  return (
    <main className={styles.page} id="main-content">
      <a className={styles.skipLink} href="#legal-content">
        Skip to {title}
      </a>
      <SiteHeader />
      <article className={styles.article} id="legal-content">
        <header className={styles.heading}>
          <h1>{title}</h1>
          <p>Effective September 15, 2026</p>
        </header>
        <div className={styles.body}>{children}</div>
      </article>
      <footer className={styles.footer}>
        <SiteLegalNav current={current} />
      </footer>
    </main>
  );
}
