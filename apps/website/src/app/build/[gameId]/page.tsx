import type { Metadata } from "next";

import BuildPage from "../page";

export const metadata: Metadata = {
  title: "Build a Game | Splat Lab!",
  description: "Create a Splat Lab game with Cooper.",
};

export const dynamic = "force-dynamic";

type EditGamePageProps = {
  params: Promise<{ gameId: string }>;
};

export default async function EditGamePage({ params }: EditGamePageProps) {
  const { gameId } = await params;

  return <BuildPage searchParams={Promise.resolve({ game: gameId })} />;
}
