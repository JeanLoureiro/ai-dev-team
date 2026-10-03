export const AGENT_TYPES = ["planner", "coder", "tester", "reviewer"] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

/** Future autonomy levels (see architecture doc section 22). v0.1 is level 2. */
export const AUTONOMY_LEVELS = [0, 1, 2, 3, 4] as const;

export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];
