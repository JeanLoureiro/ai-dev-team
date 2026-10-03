import type { FailureCategory } from "@ai-dev-team/types";

/**
 * Explicit failure categories (docs/architecture.md section 28). Failures
 * are observable and typed rather than generic "something went wrong".
 */
export class HarnessError extends Error {
  readonly category: FailureCategory;

  constructor(category: FailureCategory, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HarnessError";
    this.category = category;
  }
}

export function isHarnessError(error: unknown): error is HarnessError {
  return error instanceof HarnessError;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
