export type ModelMessage = Readonly<{
  role: "system" | "developer" | "user" | "assistant";
  content: string;
}>;

export type ModelToolDefinition = Readonly<{
  name: string;
  description: string;
  /** JSON Schema in the strict Structured Outputs subset. */
  parameters: Readonly<Record<string, unknown>>;
}>;

export type ModelToolCall = Readonly<{
  callId: string;
  name: string;
  argumentsJson: string;
}>;

export type ModelToolOutput = Readonly<{
  callId: string;
  output: string;
}>;

/**
 * Provider-shaped conversation items the caller carries between rounds of one
 * tool loop without inspecting them. They are never persisted or shown to a kid.
 */
export type ModelTurnItem = Readonly<Record<string, unknown>>;

export type ModelTurnRequest = Readonly<{
  messages: readonly ModelMessage[];
  tools?: readonly ModelToolDefinition[];
  history?: readonly ModelTurnItem[];
  toolOutputs?: readonly ModelToolOutput[];
  signal?: AbortSignal;
}>;

export type ModelTurnResult = Readonly<{
  /** Empty when the model replied with tool calls only. */
  text: string;
  toolCalls: readonly ModelToolCall[];
  items: readonly ModelTurnItem[];
}>;

export type ModelScenarioRequest = Readonly<{
  instructions: string;
  input: string;
  scenarios: readonly string[];
  signal?: AbortSignal;
}>;

export interface ModelClient {
  completeTurn(request: ModelTurnRequest): Promise<ModelTurnResult>;
  selectScenario(request: ModelScenarioRequest): Promise<string>;
}

export class ModelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigurationError";
  }
}

export class ModelProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelProviderError";
  }
}

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}
