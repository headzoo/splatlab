import { z } from "zod";

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
}>;
