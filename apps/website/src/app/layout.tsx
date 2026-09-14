import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "@fontsource/chewy/400.css";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "./globals.css";
import { AuthFlowProvider } from "./auth-flow";

export const metadata: Metadata = {
  title: "Splat Lab! | Make Games. So Much Fun.",
  description:
    "Splat Lab helps kids turn their ideas into playable games with the power of AI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AuthFlowProvider>{children}</AuthFlowProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
