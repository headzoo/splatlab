export type ActorDirection = "down" | "left" | "right" | "up";

export type BodyMotionSpec =
  | { type: "none" }
  | { type: "bob"; heightTiles: number; periodMs: number }
  | { type: "peck"; distanceTiles: number; periodMs: number };

export type MotionSpec = {
  version: 1;
  lifecycle?: {
    trigger: "camera_reaches_spawn";
    repeat: "once" | "interval";
    intervalMs?: number;
    count?: number;
  };
  travel:
    | { type: "controlled" }
    | { type: "stationary" }
    | { type: "behavior" }
    | { type: "ramming"; chargeDelayMs: number; distanceTiles: number }
    | {
        type: "circle";
        gridSizeTiles: number;
        direction: "clockwise" | "counterclockwise";
        durationMs: number;
      }
    | {
        type: "viewport_arc";
        entryEdge: "left" | "right";
        exitEdge: "left" | "right";
        entryRow: number;
        exitRow: number;
        archDirection: "up" | "down";
        archHeightTiles: number;
        durationMs: number;
        offscreenPaddingTiles: number;
      };
  visual: BodyMotionSpec;
};

export type BodyMotionOffset = { x: number; y: number };

function stablePhaseFraction(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function smoothstep(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function pulse(phase: number, start: number, peak: number, end: number) {
  if (phase < start || phase >= end) return 0;
  if (phase < peak) return smoothstep((phase - start) / (peak - start));
  return 1 - smoothstep((phase - peak) / (end - peak));
}

function directionVector(direction: ActorDirection) {
  switch (direction) {
    case "left": return { x: -1, y: 0 };
    case "right": return { x: 1, y: 0 };
    case "up": return { x: 0, y: -1 };
    default: return { x: 0, y: 1 };
  }
}

export function resolveBodyMotionOffset(
  visual: BodyMotionSpec | undefined,
  objectId: string,
  elapsedMilliseconds: number,
  tileSize: number,
  direction: ActorDirection = "down",
): BodyMotionOffset {
  if (!visual || visual.type === "none") return { x: 0, y: 0 };
  const phaseOffset = stablePhaseFraction(objectId);
  if (visual.type === "bob") {
    const phase = ((elapsedMilliseconds / visual.periodMs) + phaseOffset) * Math.PI * 2;
    return { x: 0, y: Math.sin(phase) * visual.heightTiles * tileSize };
  }

  const phase = ((elapsedMilliseconds / visual.periodMs) + phaseOffset) % 1;
  const peck = Math.max(
    pulse(phase, 0.02, 0.085, 0.17),
    pulse(phase, 0.22, 0.275, 0.35) * 0.72,
  );
  const settle = pulse(phase, 0.4, 0.44, 0.49) * -0.14;
  const distance = (peck + settle) * visual.distanceTiles * tileSize;
  const vector = directionVector(direction);
  return {
    x: vector.x * distance,
    y: vector.y * distance + peck * visual.distanceTiles * tileSize * 0.35,
  };
}
