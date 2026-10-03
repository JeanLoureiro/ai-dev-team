import { z } from "zod";

/**
 * Structured outputs produced by agents (docs/architecture.md sections
 * 6-9). The zod schemas are the runtime contract: agent output that fails
 * validation is surfaced as INVALID_AGENT_OUTPUT.
 */

export const implementationPlanSchema = z.object({
  summary: z.string().min(1),
  requirements: z.array(z.string()),
  filesToModify: z.array(z.string()),
  filesToCreate: z.array(z.string()),
  testsRequired: z.array(z.string()),
  risks: z.array(z.string()),
});

export type ImplementationPlan = z.infer<typeof implementationPlanSchema>;

export const codingResultSchema = z.object({
  changedFiles: z.array(z.string()),
  summary: z.string().min(1),
  testsAdded: z.array(z.string()),
});

export type CodingResult = z.infer<typeof codingResultSchema>;

export const testFailureSchema = z.object({
  name: z.string().optional(),
  command: z.string(),
  message: z.string(),
});

export type TestFailure = z.infer<typeof testFailureSchema>;

export const testCommandResultSchema = z.object({
  command: z.string(),
  exitCode: z.number().int(),
  passed: z.boolean(),
  durationMs: z.number(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
});

export type TestCommandResult = z.infer<typeof testCommandResultSchema>;

export const testResultSchema = z.object({
  passed: z.boolean(),
  commands: z.array(testCommandResultSchema),
  failures: z.array(testFailureSchema),
});

export type TestResult = z.infer<typeof testResultSchema>;

export const reviewIssueSchema = z.object({
  severity: z.enum(["blocking", "warning", "suggestion"]),
  message: z.string().min(1),
  file: z.string().optional(),
});

export type ReviewIssue = z.infer<typeof reviewIssueSchema>;

export const reviewResultSchema = z.object({
  approved: z.boolean(),
  blockingIssues: z.array(reviewIssueSchema),
  suggestions: z.array(reviewIssueSchema),
});

export type ReviewResult = z.infer<typeof reviewResultSchema>;
