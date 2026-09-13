export type ModelMessage = Readonly<{
  role: "system" | "developer" | "user" | "assistant";
  content: string;
}>;

export type ModelTextRequest = Readonly<{
  messages: readonly ModelMessage[];
  signal?: AbortSignal;
}>;

export type ModelScenarioRequest = Readonly<{
  instructions: string;
  input: string;
  scenarios: readonly string[];
  signal?: AbortSignal;
}>;

export interface ModelClient {
  completeText(request: ModelTextRequest): Promise<string>;
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
