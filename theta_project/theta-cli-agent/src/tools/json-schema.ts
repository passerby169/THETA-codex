import type { JsonSchema } from "./hypha-compatible.js";

export const stringSchema = (description?: string): JsonSchema => ({
  type: "string",
  ...(description ? { description } : {})
});

export const numberSchema = (description?: string): JsonSchema => ({
  type: "number",
  ...(description ? { description } : {})
});

export const booleanSchema = (description?: string): JsonSchema => ({
  type: "boolean",
  ...(description ? { description } : {})
});

export const arraySchema = (items: JsonSchema, description?: string): JsonSchema => ({
  type: "array",
  items,
  ...(description ? { description } : {})
});

export const objectSchema = (
  properties: Record<string, JsonSchema>,
  required: string[] = [],
  description?: string
): JsonSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
  ...(description ? { description } : {})
});

export const anyJsonSchema: JsonSchema = {
  description: "Arbitrary JSON value accepted by the bridge boundary."
};

export const enumStringSchema = (values: string[], description?: string): JsonSchema => ({
  type: "string",
  enum: values,
  ...(description ? { description } : {})
});
