import type { Metadata } from "next";

import { WorkspaceClient } from "./workspace-client";

export const metadata: Metadata = {
  title: "My Lab Workspace | Splat Lab!",
  description: "Create games and protect your Splat Lab workspace.",
};

export default function LabPage() {
  return <WorkspaceClient />;
}
