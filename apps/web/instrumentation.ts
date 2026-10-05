export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AI_DEV_TEAM_WATCH_ISSUES !== "1") return;
  const { startIssueWatcher } = await import("./lib/watcher");
  startIssueWatcher();
}
