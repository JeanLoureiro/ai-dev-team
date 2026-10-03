import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ai-dev-team/agents",
    "@ai-dev-team/github",
    "@ai-dev-team/harness",
    "@ai-dev-team/llm",
    "@ai-dev-team/orchestrator",
    "@ai-dev-team/store",
    "@ai-dev-team/tools",
    "@ai-dev-team/types",
  ],
};

export default nextConfig;
