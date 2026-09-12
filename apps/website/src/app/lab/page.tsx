import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { WorkspaceClient } from "./workspace-client";

export const metadata: Metadata = {
  title: "My Lab Workspace | Splat Lab!",
  description: "Create games and protect your Splat Lab workspace.",
};

export const dynamic = "force-dynamic";

export default async function LabPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/?lab-key=1");
  }

  return <WorkspaceClient />;
}
