import { FlowContractError } from "./contract";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const TEMPLATE = /\{\{\s*([^{}]+?)\s*\}\}/g;

export type InterpolationContext = Readonly<{
  question: string;
  flowOutput: string;
  flowState: Readonly<Record<string, string>>;
}>;

function valueFor(expression: string, context: InterpolationContext): string {
  if (expression === "question") return context.question;
  if (expression === "$flow.output") return context.flowOutput;
  const match = /^\$flow\.state\.([A-Za-z][A-Za-z0-9_]*)$/.exec(expression);
  if (!match || UNSAFE_KEYS.has(match[1])) {
    throw new FlowContractError(`Unsupported interpolation expression "${expression}"`);
  }
  if (!Object.hasOwn(context.flowState, match[1])) {
    throw new FlowContractError(`Missing interpolation value for "$flow.state.${match[1]}"`);
  }
  return context.flowState[match[1]];
}

export function interpolate(template: string, context: InterpolationContext): string {
  if (typeof template !== "string") throw new FlowContractError("Interpolation template must be a string");
  if (template.length > 10_000) throw new FlowContractError("Interpolation template exceeds 10000 characters");
  let matched = false;
  const result = template.replace(TEMPLATE, (_whole, expression: string) => {
    matched = true;
    return valueFor(expression.trim(), context);
  });
  if (template.includes("{{") && !matched) {
    throw new FlowContractError("Malformed interpolation expression");
  }
  return result;
}
