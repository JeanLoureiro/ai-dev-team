import type { LlmUsage } from "./types";

/**
 * USD per million tokens, keyed by model prefix so dated model ids
 * (e.g. "claude-sonnet-4-5-20250929") match their family.
 */
const MODEL_PRICING: ReadonlyArray<{
  prefix: string;
  inputPerMtok: number;
  outputPerMtok: number;
}> = [
  { prefix: "claude-opus-4", inputPerMtok: 15, outputPerMtok: 75 },
  { prefix: "claude-sonnet-4", inputPerMtok: 3, outputPerMtok: 15 },
  { prefix: "claude-haiku-4", inputPerMtok: 1, outputPerMtok: 5 },
];

/**
 * Estimated cost in USD for one LLM call. Returns 0 for unknown models;
 * callers should treat cost as best-effort telemetry.
 */
export function estimateCostUsd(model: string, usage: LlmUsage): number {
  const pricing = MODEL_PRICING.find((p) => model.startsWith(p.prefix));
  if (!pricing) return 0;
  return (
    (usage.inputTokens * pricing.inputPerMtok +
      usage.outputTokens * pricing.outputPerMtok) /
    1_000_000
  );
}
