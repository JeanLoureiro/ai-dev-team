/**
 * Tool architecture (docs/architecture.md sections 11-12).
 *
 * Tools are explicitly registered with the harness. Agents never execute
 * anything directly: they request a tool call, and the harness validates
 * the policy, executes, and records the result.
 */

export type JsonSchema = Record<string, unknown>;

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type ToolResult = {
  toolCallId?: string;
  /** True when the harness denied the call before execution. */
  denied?: boolean;
  output?: unknown;
  /** Human-readable error description when the call failed or was denied. */
  error?: string;
  durationMs?: number;
};

/** Execution context injected by the harness into every tool call. */
export type ToolContext = {
  /** Absolute path of the isolated workspace the agent operates in. */
  workspaceRoot: string;
  /** Aborted when the run or tool timeout elapses. */
  signal?: AbortSignal;
};

export type AgentTool = {
  name: string;
  description: string;
  /** JSON Schema describing the tool input, passed to the LLM. */
  inputSchema: JsonSchema;
  /**
   * Input fields that hold workspace-relative file paths. The harness
   * validates each against the agent's path policy before execution.
   */
  pathInputs?: string[];
  /**
   * Input field holding a shell command string. The harness validates it
   * against the agent's command allowlist before execution.
   */
  commandInput?: string;
  execute: (input: unknown, ctx: ToolContext) => Promise<unknown>;
};

/**
 * Per-agent policy enforced by the harness, never by the prompt
 * (docs/architecture.md section 12).
 */
export type ToolPolicy = {
  /** Tool names the agent may call. */
  allowedTools: string[];
  /**
   * Workspace-relative glob patterns the agent may access. Empty means
   * "all paths except denied".
   */
  allowedPaths: string[];
  /** Workspace-relative glob patterns that are always denied. */
  deniedPaths: string[];
  /** Glob patterns matched against the full command string. */
  allowedCommands: string[];
  /** Per-tool-call wall clock budget. */
  maxExecutionTimeMs: number;
  /** Maximum LLM round-trips inside one agent loop. */
  maxIterations: number;
};

/** Serialization-safe definition of a tool, sent to the LLM. */
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};
