import { diffLockfiles } from "./diff.js";
import { emptyLockfile, parseLockfile } from "./parse/index.js";
import type { FileReport } from "./report.js";
import { licenseFindings, runRules, type RuleOptions } from "./rules.js";

/** Diffs two versions of one lockfile and runs the offline rules. `null` means the file didn't exist on that side. */
export function analyzeLockfile(file: string, baseText: string | null, headText: string | null, opts: RuleOptions = {}): FileReport | null {
  if (baseText === headText) return null;
  const kind = file.endsWith(".json") ? "npm" : "yarn";
  const base = baseText === null ? emptyLockfile(kind) : parseLockfile(file, baseText);
  const head = headText === null ? emptyLockfile(kind) : parseLockfile(file, headText);
  const diff = diffLockfiles(base, head);
  return { file, diff, findings: [...runRules(diff, opts), ...licenseFindings(diff, base.packages)] };
}
