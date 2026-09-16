import type { Metadata } from "next";

import { LegalDocument } from "../legal-document";

export const metadata: Metadata = {
  title: "Terms of Use | Splat Lab!",
  description:
    "The terms that apply when kids and families use Splat Lab to create and play games.",
};

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Use" current="terms">
      <p>
        These Terms of Use explain the rules for using Splat Lab! at splatlab.games
        (the “Service”). By using the Service, you agree to these terms. If you
        are a parent or guardian, you also agree on behalf of a child who uses
        Splat Lab! with your permission.
      </p>

      <h2>Who Splat Lab! is for</h2>
      <p>
        Splat Lab! is a kids’ game-making lab. Children should use it with a
        parent or guardian nearby. You must only use the Service if you are
        allowed to do so where you live, and parents should decide whether the
        Service is a good fit for their child.
      </p>

      <h2>Accounts and Lab Keys</h2>
      <p>
        You can start creating with an anonymous Lab session. We do not ask for
        an email address or password. A Lab Key lets a family return to the same
        workspace. Keep Lab Keys private, the same way you would keep a house
        key private. Anyone with a Lab Key can open that workspace.
      </p>
      <p>
        You can sign out, replace a Lab Key, or sign out everywhere from My Lab.
        Replacing a key or signing out everywhere ends older sessions.
      </p>

      <h2>Acceptable use</h2>
      <p>When you use Splat Lab!, you agree not to:</p>
      <ul>
        <li>Use the Service to harm, bully, or harass anyone.</li>
        <li>
          Try to trick Cooper, bypass safety checks, or send sexual, hateful, or
          otherwise inappropriate content.
        </li>
        <li>
          Upload or share content you do not have the right to use, including
          other people’s copyrighted work, personal information, or images of
          people without permission.
        </li>
        <li>
          Break, overload, scrape, or interfere with the Service, or try to
          access another family’s workspace.
        </li>
        <li>Use Splat Lab! for ads, spam, or commercial scraping.</li>
      </ul>
      <p>
        We may decline Cooper messages, hide or remove games and media, or
        suspend access when we believe these rules were broken or when we need
        to keep the lab safe.
      </p>

      <h2>Games, media, and sharing</h2>
      <p>
        You keep the rights you already have in the games, names, screenshots,
        and videos you create. To run the Service, you give Splat Lab! a
        worldwide license to host, copy, display, and share that content as
        needed to save your work, show it in the builder and player, and honor
        the sharing choice you make.
      </p>
      <p>
        Games can stay in your Lab or be published to the public catalog.
        Screenshots and videos can be shared with a link. Public or link-shared
        content may be seen by anyone with the link, and public games may appear
        on splatlab.games. Do not publish anything you want to keep private.
      </p>

      <h2>Cooper and AI</h2>
      <p>
        Cooper is an AI helper. He can change a game from a chat message, and
        he can get things wrong, weird, or incomplete. Always play-test what he
        builds. Cooper messages are screened so the conversation stays about
        making games. That safety net is not perfect.
      </p>

      <h2>Our intellectual property</h2>
      <p>
        Splat Lab!, Cooper, the lab characters, artwork, software, and brand
        materials belong to Splat Lab! and our licensors. These terms do not
        give you ownership of that material. You may use the Service to make and
        play games; you may not copy the product, scrape its assets, or use our
        brand to suggest we endorse something we do not.
      </p>

      <h2>The Service is provided as-is</h2>
      <p>
        Splat Lab! is an evolving product. We do not promise that it will always
        be available, error-free, or fit a particular purpose. Games, media, and
        workspaces can be lost. Keep your own copies of anything you cannot
        bear to lose.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent allowed by law, Splat Lab! is not liable for
        indirect, incidental, special, consequential, or punitive damages, or
        for lost games, data, or profits, arising from your use of the Service.
        Some places do not allow these limits, so they may not apply to you.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms as the Service changes. The effective date at
        the top of this page will change when we do. Continued use after an
        update means you accept the revised terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms can be sent to{" "}
        <a href="mailto:privacy@splatlab.games">privacy@splatlab.games</a>.
      </p>
    </LegalDocument>
  );
}
