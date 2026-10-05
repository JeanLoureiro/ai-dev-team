"use client";

import { useState } from "react";
import type { AgentEvent } from "@ai-dev-team/types";

export function CollapsibleTimeline({ events }: { events: AgentEvent[] }) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="panel">
      <div className="timeline-header">
        <h2>Timeline</h2>
        <button
          className="timeline-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse timeline" : "Expand timeline"}
        >
          {isExpanded ? "▼" : "▶"}
        </button>
      </div>
      {isExpanded && (
        <ul className="timeline">
          {events.map((e) => (
            <li key={e.id}>
              <div>
                {e.type}
                {e.agent ? ` (${e.agent})` : ""}
              </div>
              <div className="t">{e.timestamp.toISOString()}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
