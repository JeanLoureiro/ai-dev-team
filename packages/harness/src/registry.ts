import type { AgentTool, ToolDefinition } from "@ai-dev-team/types";

/**
 * Explicit tool registry (docs/architecture.md section 11). A tool only
 * exists for agents if it is registered here AND allowed by the agent's
 * policy.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: AgentTool[]): void {
    for (const tool of tools) this.register(tool);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Tool definitions to hand to the LLM for the given allowlist. */
  definitions(allowedTools: string[]): ToolDefinition[] {
    const defs: ToolDefinition[] = [];
    for (const name of allowedTools) {
      const tool = this.tools.get(name);
      if (tool) {
        defs.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }
    return defs;
  }
}
