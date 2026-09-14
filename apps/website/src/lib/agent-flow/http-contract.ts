import { z } from "zod";

import type { CooperSpecChange } from "../game-objects";
import type { GamePhysicsDocument } from "../game-physics";

const visibleText = z.string().trim().min(1).max(500);

export const buildTurnMessageInputSchema = z
  .object({
    message: visibleText,
  })
  .strict();

export const buildTurnActionInputSchema = z
  .object({
    action: z.enum(["proceed", "reject"]),
    feedback: visibleText.optional(),
  })
  .strict();

export const buildTurnInputSchema = z.union([
  buildTurnMessageInputSchema,
  buildTurnActionInputSchema,
]);

export type BuildTurnMessageInput = z.infer<typeof buildTurnMessageInputSchema>;
export type BuildTurnActionInput = z.infer<typeof buildTurnActionInputSchema>;
export type BuildTurnInput = z.infer<typeof buildTurnInputSchema>;

export type BuildTurnResponseBody = Readonly<{
  status: "replied" | "paused";
  cooperMessage: string;
  runId: string;
  /** Present only when this turn changed the game's physics. */
  physicsDocument?: GamePhysicsDocument;
  /** Present only when this turn added or removed objects. */
  specChange?: CooperSpecChange;
  /**
   * Present only when this turn renamed the game. The name is stored beside the
   * spec, so the builder has to be told about it or its next autosave would
   * write the old name back.
   */
  title?: string;
}>;
