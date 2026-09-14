import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_TOOL_IDS } from "./allowlist";
import { getAgentTool } from "./registry";

/**
 * Keywords Structured Outputs rejects. Bounds belong in descriptions and are
 * enforced by the tool, not the schema — see game-object-tools and
 * game-physics-tools.
 */
const UNSUPPORTED_KEYWORDS = new Set([
  "allOf",
  "contains",
  "dependentRequired",
  "dependentSchemas",
  "else",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "if",
  "maxItems",
  "maxLength",
  "maxProperties",
  "maximum",
  "minItems",
  "minLength",
  "minProperties",
  "minimum",
  "multipleOf",
  "not",
  "pattern",
  "patternProperties",
  "prefixItems",
  "propertyNames",
  "then",
  "unevaluatedItems",
  "unevaluatedProperties",
  "uniqueItems",
]);

function assertStrictSchema(schema: unknown, path: string): void {
  assert.ok(schema && typeof schema === "object" && !Array.isArray(schema), `${path} must be an object`);
  const node = schema as Record<string, unknown>;

  for (const key of Object.keys(node)) {
    assert.ok(!UNSUPPORTED_KEYWORDS.has(key), `${path} uses unsupported keyword "${key}"`);
  }

  if (node.anyOf !== undefined) {
    assert.ok(Array.isArray(node.anyOf), `${path}.anyOf must be an array`);
    for (const [index, variant] of node.anyOf.entries()) {
      assertStrictSchema(variant, `${path}.anyOf[${index}]`);
    }
    return;
  }

  if (node.type === "object") {
    assert.equal(node.additionalProperties, false, `${path} must set additionalProperties: false`);
    assert.ok(node.properties && typeof node.properties === "object" && !Array.isArray(node.properties), `${path} must have properties`);
    assert.ok(Array.isArray(node.required), `${path} must have required`);
    const properties = Object.keys(node.properties as object);
    const required = node.required as unknown[];
    for (const key of properties) {
      assert.ok(required.includes(key), `${path}.properties.${key} must be listed in required`);
    }
    for (const key of required) {
      assert.equal(typeof key, "string", `${path}.required has a non-string entry`);
      assert.ok(properties.includes(key as string), `${path}.required lists unknown "${String(key)}"`);
    }
    for (const [key, value] of Object.entries(node.properties as object)) {
      assertStrictSchema(value, `${path}.properties.${key}`);
    }
    return;
  }

  if (node.type === "array") {
    assert.ok("items" in node, `${path} must have items`);
    assertStrictSchema(node.items, `${path}.items`);
  }

  if (Array.isArray(node.enum)) {
    assert.ok(node.enum.length > 0, `${path}.enum must not be empty`);
  }
}

test("every allowlisted tool schema is in the strict Structured Outputs subset", () => {
  for (const id of AGENT_TOOL_IDS) {
    const { definition } = getAgentTool(id);
    assert.equal(definition.name, id);
    assertStrictSchema(definition.parameters, id);
  }
});
