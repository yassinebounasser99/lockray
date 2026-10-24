import { readFileSync } from "node:fs";
import { COMMENT_MARKER } from "./report.js";

interface Comment {
  id: number;
  body?: string;
}

function prNumber(): number | null {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return null;
  try {
    const event = JSON.parse(readFileSync(path, "utf8")) as { pull_request?: { number?: number }; number?: number };
    return event.pull_request?.number ?? null;
  } catch {
    return null;
  }
}

/**
 * Creates or updates a single "sticky" lockray comment on the current pull
 * request, so re-runs edit the same comment instead of piling up new ones.
 */
export async function upsertPullRequestComment(markdown: string): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const api = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const number = prNumber();
  if (!token || !repo || !number) return "not a pull request run; skipped the PR comment";

  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "content-type": "application/json",
  };

  let existing: Comment | undefined;
  for (let page = 1; page <= 10 && !existing; page++) {
    const res = await fetch(`${api}/repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`, { headers });
    if (!res.ok) throw new Error(`listing PR comments failed: ${res.status} ${await res.text()}`);
    const comments = (await res.json()) as Comment[];
    existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));
    if (comments.length < 100) break;
  }

  const body = JSON.stringify({ body: markdown });
  const res = existing
    ? await fetch(`${api}/repos/${repo}/issues/comments/${existing.id}`, { method: "PATCH", headers, body })
    : await fetch(`${api}/repos/${repo}/issues/${number}/comments`, { method: "POST", headers, body });

  if (res.status === 403) {
    return "no permission to comment (forked PR or missing `pull-requests: write`); the report is in the job summary instead";
  }
  if (!res.ok) throw new Error(`posting the PR comment failed: ${res.status} ${await res.text()}`);
  return existing ? `updated PR comment on #${number}` : `posted PR comment on #${number}`;
}
