import "server-only";

import {
  type ModelClient,
  type ModelScenarioRequest,
  type ModelTextRequest,
  ModelConfigurationError,
  ModelOutputError,
  ModelProviderError,
} from "./model-client";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_OUTPUT_TOKENS = 300;

type ResponsesOutputContent = {
  type?: unknown;
  text?: unknown;
};

type ResponsesOutputItem = {
  type?: unknown;
  content?: unknown;
};

type ResponsesPayload = {
  output?: unknown;
};

function extractResponsesOutputText(payload: ResponsesPayload): string {
  if (!Array.isArray(payload.output)) {
    throw new ModelOutputError("Model response has no text output");
  }

  const parts: string[] = [];
  for (const item of payload.output) {
    if (!item || typeof item !== "object" || (item as ResponsesOutputItem).type !== "message") {
      continue;
    }
    const content = (item as ResponsesOutputItem).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const outputBlock = block as ResponsesOutputContent;
      if (outputBlock.type !== "output_text" || typeof outputBlock.text !== "string") continue;
      parts.push(outputBlock.text);
    }
  }

  if (!parts.length) {
    throw new ModelOutputError("Model response has no text output");
  }
  return parts.join("");
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

  async completeText(request: ModelTextRequest): Promise<string> {
    return this.requestText({
      input: request.messages,
      signal: request.signal,
    });
  }

  async selectScenario(request: ModelScenarioRequest): Promise<string> {
    if (!request.scenarios.length) throw new ModelOutputError("Condition Agent has no scenarios");
    return this.requestText({
      input: [{ role: "developer", content: request.instructions }, { role: "user", content: request.input }],
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
      scenarioResponse: true,
    });
  }

  private async requestText(options: {
    input: readonly { role: string; content: string }[];
    signal?: AbortSignal;
    text?: unknown;
    scenarioResponse?: boolean;
  }): Promise<string> {
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
          max_output_tokens: MAX_OUTPUT_TOKENS,
          store: false,
          ...(options.text ? { text: options.text } : {}),
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

    const outputText = extractResponsesOutputText(payload);
    if (!options.scenarioResponse) return outputText;

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
}
