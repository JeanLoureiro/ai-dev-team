import type {
  AgentType,
  ToolCall,
  ToolContext,
  ToolDefinition,
  ToolPolicy,
  ToolResult,
} from "@ai-dev-team/types";
import { describeError, HarnessError, isHarnessError } from "./errors";
import { emitEvent, type EventSink } from "./events";
import { assertCommandAllowed, assertPathAllowed } from "./policy";
import type { ToolRegistry } from "./registry";

export type HarnessOptions = {
  registry: ToolRegistry;
  policy: ToolPolicy;
  workspaceRoot: string;
  events: EventSink;
  runId: string;
  agent: AgentType;
  /** Aborts in-flight tool execution when the whole run is cancelled. */
  signal?: AbortSignal;
};

/**
 * The agent harness: the safety and control layer between an agent and
 * every capability it uses (docs/architecture.md section 10).
 *
 * Flow per call: validate permission -> validate paths/command ->
 * execute -> record -> return. Tool failures are returned to the agent
 * as results rather than thrown, so the agent can react to them.
 */
export class AgentHarness {
  constructor(private readonly options: HarnessOptions) {}

  get agent(): AgentType {
    return this.options.agent;
  }

  get policy(): ToolPolicy {
    return this.options.policy;
  }

  /** Tool definitions exposed to the LLM, scoped to this agent's policy. */
  toolDefinitions(): ToolDefinition[] {
    return this.options.registry.definitions(this.options.policy.allowedTools);
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const { policy, registry, workspaceRoot, events, runId, agent } =
      this.options;
    const started = Date.now();

    await emitEvent(events, {
      runId,
      type: "tool.requested",
      agent,
      input: { name: call.name, input: call.input },
    });

    const deny = async (reason: string): Promise<ToolResult> => {
      await emitEvent(events, {
        runId,
        type: "tool.denied",
        agent,
        input: { name: call.name, input: call.input },
        metadata: { reason },
      });
      return {
        toolCallId: call.id,
        denied: true,
        error: `PERMISSION_DENIED: ${reason}`,
        durationMs: Date.now() - started,
      };
    };

    const tool = registry.get(call.name);
    if (!tool) return deny(`Unknown tool: ${call.name}`);
    if (!policy.allowedTools.includes(call.name)) {
      return deny(`Tool not allowed for ${agent}: ${call.name}`);
    }

    const input = (call.input ?? {}) as Record<string, unknown>;
    try {
      for (const field of tool.pathInputs ?? []) {
        const value = input[field];
        const values =
          typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
        for (const v of values) {
          if (typeof v === "string" && v !== "") {
            assertPathAllowed(policy, workspaceRoot, v);
          }
        }
      }
      if (tool.commandInput) {
        const value = input[tool.commandInput];
        if (typeof value !== "string" || value.trim() === "") {
          throw new HarnessError(
            "INVALID_AGENT_OUTPUT",
            `Tool ${tool.name} requires a non-empty ${tool.commandInput}`,
          );
        }
        assertCommandAllowed(policy, value);
      }
    } catch (error) {
      if (isHarnessError(error)) return deny(error.message);
      throw error;
    }

    const timeout = AbortSignal.timeout(policy.maxExecutionTimeMs);
    const signal = this.options.signal
      ? AbortSignal.any([this.options.signal, timeout])
      : timeout;
    const ctx: ToolContext = { workspaceRoot, signal };

    try {
      const output = await tool.execute(input, ctx);
      const durationMs = Date.now() - started;
      await emitEvent(events, {
        runId,
        type: "tool.completed",
        agent,
        input: { name: call.name, input: call.input },
        metadata: { durationMs, success: true },
      });
      return { toolCallId: call.id, output, durationMs };
    } catch (error) {
      const durationMs = Date.now() - started;
      const message = isHarnessError(error)
        ? `${error.category}: ${error.message}`
        : `TOOL_FAILURE: ${describeError(error)}`;
      await emitEvent(events, {
        runId,
        type: "tool.completed",
        agent,
        input: { name: call.name, input: call.input },
        metadata: { durationMs, success: false, error: message },
      });
      return { toolCallId: call.id, error: message, durationMs };
    }
  }
}
