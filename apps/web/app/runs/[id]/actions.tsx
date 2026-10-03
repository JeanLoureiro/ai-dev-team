"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunActions({ runId }: { runId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(path: string, body: object = {}) {
    setPending(path);
    setError(null);
    const res = await fetch(`/api/runs/${runId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `Request failed: ${res.status}`);
      return;
    }
    router.refresh();
  }

  async function requestChanges() {
    const comment = window.prompt("Describe the changes you want:");
    if (comment === null) return;
    await decide("request-changes", { comment });
  }

  return (
    <div>
      <div className="row">
        <button
          className="primary"
          disabled={pending !== null}
          onClick={() => decide("approve")}
        >
          Approve and create PR
        </button>
        <button disabled={pending !== null} onClick={requestChanges}>
          Request changes
        </button>
        <button
          className="danger"
          disabled={pending !== null}
          onClick={() => decide("reject")}
        >
          Reject
        </button>
      </div>
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}
