import type { LabWorkspaceSnapshot } from "./lab-workspace-cache";

let memorySnapshot: LabWorkspaceSnapshot | null = null;

export function readLabWorkspaceMemory(): LabWorkspaceSnapshot | null {
  return memorySnapshot;
}

export function writeLabWorkspaceMemory(snapshot: LabWorkspaceSnapshot) {
  memorySnapshot = snapshot;
}

export function clearLabWorkspaceMemory() {
  memorySnapshot = null;
}
