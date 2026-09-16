import type { Metadata } from "next";

import { LegalDocument } from "../legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy | Splat Lab!",
  description:
    "How Splat Lab collects, uses, and shares information when kids create and play games.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy Policy" current="privacy">
      <p>
        This Privacy Policy explains how Splat Lab! (“we”) handles information
        on splatlab.games. It is written for parents and families. It describes
        how the product works today; it is not a substitute for legal advice.
      </p>

      <h2>Built for kids</h2>
      <p>
        Splat Lab! is a kids’ creation lab. We designed it so a child can make
        and play games without a public social profile, without an advertising
        business model, and without handing over an email address or password.
        Parents should still stay nearby, because children can share games and
        talk with Cooper.
      </p>

      <h2>What we collect</h2>
      <p>Depending on how the Service is used, we may store:</p>
      <ul>
        <li>
          <strong>Lab session information.</strong> An anonymous account, a
          session cookie, and sometimes an IP address and browser user agent
          attached to that session. We do not ask kids for a real name, email,
          or password.
        </li>
        <li>
          <strong>Display name and avatar.</strong> A chosen lab name and
          portrait, which can be a playful generated name rather than a child’s
          real name.
        </li>
        <li>
          <strong>Lab Keys.</strong> A recovery key for My Lab. We show the
          readable key when it is created. We store a hashed lookup, not the
          key itself, so we can check a key later without keeping a copy of it.
        </li>
        <li>
          <strong>Games and media.</strong> Game titles, maps, settings,
          thumbnails, screenshots, and videos you save, plus whether a game is
          public.
        </li>
        <li>
          <strong>Cooper chat.</strong> Messages typed to Cooper so he can
          change a game, and related safety checks.
        </li>
        <li>
          <strong>Usage analytics.</strong> High-level site performance and
          visit information from our hosting provider.
        </li>
      </ul>

      <h2>How we use information</h2>
      <p>We use this information to:</p>
      <ul>
        <li>Run Lab sessions and remember a workspace with a Lab Key.</li>
        <li>Save, load, and play games.</li>
        <li>Let Cooper help build and change games.</li>
        <li>Screen chat and names so the lab stays about making games.</li>
        <li>Host, secure, debug, and understand how the Service is doing.</li>
        <li>Honor public or link-based sharing choices.</li>
      </ul>
      <p>We do not sell personal information, and we do not show third-party ads.</p>

      <h2>Who we share with</h2>
      <p>
        We use other companies to operate the Service. They only get what they
        need to do that work:
      </p>
      <ul>
        <li>
          <strong>Hosting and storage.</strong> The site, database, and uploaded
          screenshots and videos are hosted on infrastructure providers (today
          that includes Vercel and Neon).
        </li>
        <li>
          <strong>Cooper and safety checks.</strong> Chat messages and some
          names are sent to OpenAI so Cooper can help build games and so we can
          screen content.
        </li>
        <li>
          <strong>Analytics.</strong> Vercel Analytics and Speed Insights help
          us see whether pages are working.
        </li>
      </ul>
      <p>
        We may also share information if the law requires it, or if we need to
        protect a child, a family, or the Service.
      </p>

      <h2>Cookies and similar technology</h2>
      <p>
        We use a session cookie so a browser can stay signed in to a Lab. Our
        hosting provider may also set cookies or similar tools for analytics and
        performance. The Service needs the session cookie to remember a
        workspace; analytics cookies are used to operate and improve the site.
      </p>

      <h2>Sharing games and media</h2>
      <p>
        A game kept private in My Lab is not listed in the public catalog. If
        you publish a game, it can appear on splatlab.games for anyone to play.
        Screenshots and videos can be opened by anyone who has the share link.
        Think of those links like a photocopied drawing you handed to a friend:
        we cannot control what happens after someone else has the link.
      </p>

      <h2>Children’s privacy</h2>
      <p>
        We aim to collect only what the lab needs to save a workspace and make
        games. We do not require a child’s real name or email. Please do not
        type addresses, phone numbers, school names, or other personal details
        into Cooper chat, game titles, or shared media. If you believe a child
        has shared personal information through Splat Lab!, write to us and we
        will look into it.
      </p>

      <h2>Keeping and deleting information</h2>
      <p>
        We keep Lab data while an account and its games exist so families can
        come back and keep building. Signing out everywhere ends sessions.
        Replacing a Lab Key revokes older keys. To ask us to delete a workspace
        or investigate a privacy concern, email{" "}
        <a href="mailto:privacy@splatlab.games">privacy@splatlab.games</a>.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a meaningful way, we will update the effective
        date at the top of this page.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions and requests:{" "}
        <a href="mailto:privacy@splatlab.games">privacy@splatlab.games</a>.
      </p>
    </LegalDocument>
  );
}
