import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from "./types";

/**
 * Deterministic provider for tests and development. Canned responses are
 * consumed in order; an optional handler can generate responses from the
 * request instead.
 */
export class FakeLlmProvider implements LlmProvider {
  readonly name = "fake";
  readonly requests: LlmRequest[] = [];
  private readonly queue: LlmResponse[] = [];
  private handler?: (request: LlmRequest) => LlmResponse;

  enqueue(response: LlmResponse): this {
    this.queue.push(response);
    return this;
  }

  setHandler(handler: (request: LlmRequest) => LlmResponse): this {
    this.handler = handler;
    return this;
  }

  static textResponse(text: string): LlmResponse {
    return {
      content: [{ type: "text", text }],
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 5 },
      model: "fake",
    };
  }

  static toolUseResponse(name: string, input: unknown, id = "tool-1"): LlmResponse {
    return {
      content: [{ type: "tool_use", id, name, input }],
      stopReason: "tool_use",
      usage: { inputTokens: 10, outputTokens: 5 },
      model: "fake",
    };
  }

  async createMessage(request: LlmRequest): Promise<LlmResponse> {
    // Snapshot so later mutations of the messages array don't rewrite history.
    this.requests.push(structuredClone(request));
    if (this.handler) return this.handler(request);
    const next = this.queue.shift();
    if (!next) {
      throw new Error(
        `FakeLlmProvider: no response queued (request #${this.requests.length})`,
      );
    }
    return next;
  }
}
