import { analyzeLockfile } from "./analyze.js";
import { onlineFindings } from "./registry.js";
import { collapseFindings, formatMarkdown } from "./report.js";
import { RULES } from "./ruledocs.js";

/** Guess the lockfile type from its contents, for text pasted without a filename. */
export function guessFileName(text: string): string {
  const t = text.trimStart();
  if (t.startsWith("{")) return "package-lock.json";
  if (/^lockfileVersion:/m.test(t)) return "pnpm-lock.yaml";
  return "yarn.lock";
}

export async function analyze(before: string, after: string, opts: { online?: boolean; allowedHosts?: string[] } = {}) {
  const file = guessFileName(after || before);
  const report = analyzeLockfile(file, before || null, after || null, { allowedHosts: opts.allowedHosts });
  if (!report) return { file, report: null, markdown: "" };
  if (opts.online) {
    const { findings } = await onlineFindings(report.diff.introduced, { minReleaseAgeDays: 3, newPackageDays: 30, concurrency: 6, limit: 150 });
    report.findings.push(...findings);
  }
  return {
    file,
    report,
    collapsed: collapseFindings(report.findings),
    markdown: formatMarkdown({ base: "before", head: "after", files: [report] }),
  };
}

declare global {
  interface Window {
    lockray: { analyze: typeof analyze; RULES: typeof RULES };
  }
}

window.lockray = { analyze, RULES };
