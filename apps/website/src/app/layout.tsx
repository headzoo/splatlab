import type { Metadata } from "next";
import "@fontsource/chewy/400.css";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Splat Lab! | Make Games. So Much Fun.",
  description:
    "Splat Lab helps kids turn their ideas into playable games with the power of AI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
