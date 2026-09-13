import "server-only";

import {
  type ModelClient,
  type ModelScenarioRequest,
  type ModelToolCall,
  type ModelToolDefinition,
  type ModelToolOutput,
  type ModelTurnItem,
  type ModelTurnRequest,
  type ModelTurnResult,
  ModelConfigurationError,
  ModelOutputError,
  ModelProviderError,
} from "./model-client";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
/**
 * Reasoning models bill hidden reasoning against `max_output_tokens` before
 * emitting any text or tool call, so every budget below reserves room for it.
 * A tool round on gpt-5-mini spends roughly 500-700 tokens thinking. The
 * kid-visible reply stays short because `normalizeVisible` trims it.
 */
const REASONING_ALLOWANCE_TOKENS = 2_000;
const MAX_OUTPUT_TOKENS = REASONING_ALLOWANCE_TOKENS + 300;
/**
 * Tool rounds must fit both a call's arguments and the closing reply, and they
 * get a larger allowance than a plain reply. Placing objects means reading an
 * eighty-column level and emitting a cell per object, which costs several
 * times what a physics patch does; at the smaller budget the response came
 * back `incomplete` before it ever emitted the call.
 */
const MAX_TOOL_OUTPUT_TOKENS = 3 * REASONING_ALLOWANCE_TOKENS + 700;
/** Only these output item types are echoed back on the next round. */
const ECHOED_ITEM_TYPES = new Set(["message", "function_call"]);

type ResponsesOutputContent = {
  type?: unknown;
  text?: unknown;
};

type ResponsesOutputItem = {
  type?: unknown;
  content?: unknown;
  call_id?: unknown;
  name?: unknown;
  arguments?: unknown;
};

type ResponsesPayload = {
  output?: unknown;
  status?: unknown;
  incomplete_details?: unknown;
};

/**
 * A truncated response carries no text and no tool call, so it has to be
 * reported as a provider failure rather than surfacing as malformed output.
 */
function assertComplete(payload: ResponsesPayload): void {
  if (payload.status !== "incomplete") return;
  const details = payload.incomplete_details;
  const reason = details && typeof details === "object" && typeof (details as { reason?: unknown }).reason === "string"
    ? (details as { reason: string }).reason
    : "unknown";
  throw new ModelProviderError(`Model response was cut off (${reason})`);
}

function outputItems(payload: ResponsesPayload): readonly ResponsesOutputItem[] {
  if (!Array.isArray(payload.output)) {
    throw new ModelOutputError("Model response has no output items");
  }
  return payload.output.filter(
    (item): item is ResponsesOutputItem => Boolean(item) && typeof item === "object",
  );
}

function collectOutputText(items: readonly ResponsesOutputItem[]): string {
  const parts: string[] = [];
  for (const item of items) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const block of item.content) {
      if (!block || typeof block !== "object") continue;
      const outputBlock = block as ResponsesOutputContent;
      if (outputBlock.type !== "output_text" || typeof outputBlock.text !== "string") continue;
      parts.push(outputBlock.text);
    }
  }
  return parts.join("");
}

function collectToolCalls(items: readonly ResponsesOutputItem[]): ModelToolCall[] {
  const calls: ModelToolCall[] = [];
  for (const item of items) {
    if (item.type !== "function_call") continue;
    if (typeof item.call_id !== "string" || typeof item.name !== "string") {
      throw new ModelOutputError("Model tool call is missing an identifier");
    }
    calls.push({
      callId: item.call_id,
      name: item.name,
      argumentsJson: typeof item.arguments === "string" ? item.arguments : "",
    });
  }
  return calls;
}

function serializeTool(tool: ModelToolDefinition) {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: true,
  };
}

function serializeToolOutput(output: ModelToolOutput) {
  return { type: "function_call_output", call_id: output.callId, output: output.output };
}

export class OpenAIResponsesModelClient implements ModelClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(environment: NodeJS.ProcessEnv = process.env, timeoutMs = 30_000) {
    this.apiKey = environment.OPENAI_API_KEY?.trim() ?? "";
    this.model = environment.OPENAI_MODEL?.trim() ?? "";
    this.timeoutMs = Math.max(1_000, Math.min(timeoutMs, 60_000));
    if (!this.apiKey || !this.model) {
      throw new ModelConfigurationError("OPENAI_API_KEY and OPENAI_MODEL must be configured");
    }
  }

  async completeTurn(request: ModelTurnRequest): Promise<ModelTurnResult> {
    const tools = request.tools ?? [];
    const echoed: ModelTurnItem[] = [
      ...(request.history ?? []),
      ...(request.toolOutputs ?? []).map(serializeToolOutput),
    ];
    const payload = await this.post({
      input: [...request.messages, ...echoed],
      maxOutputTokens: tools.length ? MAX_TOOL_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS,
      signal: request.signal,
      ...(tools.length ? { tools: tools.map(serializeTool), tool_choice: "auto" } : {}),
    });

    const items = outputItems(payload);
    return {
      text: collectOutputText(items),
      toolCalls: collectToolCalls(items),
      items: [
        ...echoed,
        ...items.filter((item) => ECHOED_ITEM_TYPES.has(String(item.type))) as ModelTurnItem[],
      ],
    };
  }

  async selectScenario(request: ModelScenarioRequest): Promise<string> {
    if (!request.scenarios.length) throw new ModelOutputError("Condition Agent has no scenarios");
    const payload = await this.post({
      input: [
        { role: "developer", content: request.instructions },
        { role: "user", content: request.input },
      ],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      signal: request.signal,
      text: {
        format: {
          type: "json_schema",
          name: "condition_scenario",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["scenario"],
            properties: { scenario: { type: "string", enum: request.scenarios } },
          },
        },
      },
    });

    const outputText = collectOutputText(outputItems(payload));
    if (!outputText) throw new ModelOutputError("Condition Agent response has no text output");
    try {
      const parsed: unknown = JSON.parse(outputText);
      if (!parsed || typeof parsed !== "object" || !("scenario" in parsed) || typeof parsed.scenario !== "string") {
        throw new Error("invalid schema");
      }
      return parsed.scenario;
    } catch {
      throw new ModelOutputError("Condition Agent response is malformed");
    }
  }

  private async post(options: {
    input: readonly unknown[];
    maxOutputTokens: number;
    signal?: AbortSignal;
    text?: unknown;
    tools?: readonly unknown[];
    tool_choice?: string;
  }): Promise<ResponsesPayload> {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
    let response: Response;
    try {
      response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          input: options.input,
          max_output_tokens: options.maxOutputTokens,
          store: false,
          ...(options.text ? { text: options.text } : {}),
          ...(options.tools ? { tools: options.tools, tool_choice: options.tool_choice } : {}),
        }),
        signal,
      });
    } catch {
      throw new ModelProviderError("Model request failed");
    }
    if (!response.ok) throw new ModelProviderError(`Model request returned ${response.status}`);

    let payload: ResponsesPayload;
    try {
      payload = await response.json() as ResponsesPayload;
    } catch {
      throw new ModelProviderError("Model returned an invalid response");
    }
    assertComplete(payload);
    return payload;
  }
}
