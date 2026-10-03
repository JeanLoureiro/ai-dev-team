"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function NewRunForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const body = {
      owner: String(form.get("owner") ?? "").trim(),
      repo: String(form.get("repo") ?? "").trim(),
      issueNumber: Number(form.get("issueNumber")),
      ...(String(form.get("workspacePath") ?? "").trim()
        ? { workspacePath: String(form.get("workspacePath")).trim() }
        : {}),
    };
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `Request failed: ${res.status}`);
      return;
    }
    const run = (await res.json()) as { id: string };
    router.push(`/runs/${run.id}`);
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="row">
        <div className="field">
          <label htmlFor="owner">Owner</label>
          <input id="owner" name="owner" placeholder="acme" required />
        </div>
        <div className="field">
          <label htmlFor="repo">Repository</label>
          <input id="repo" name="repo" placeholder="demo-app" required />
        </div>
        <div className="field">
          <label htmlFor="issueNumber">Issue #</label>
          <input id="issueNumber" name="issueNumber" type="number" min="1" required />
        </div>
        <div className="field">
          <label htmlFor="workspacePath">Workspace path (optional)</label>
          <input
            id="workspacePath"
            name="workspacePath"
            placeholder="/path/to/checkout"
            size={28}
          />
        </div>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? "Starting..." : "Start run"}
        </button>
      </div>
      {error ? <p className="muted">{error}</p> : null}
      <p className="muted">
        The workspace must be a local git checkout of the repository.
      </p>
    </form>
  );
}
