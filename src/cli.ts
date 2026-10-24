import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { analyzeLockfile } from "./analyze.js";
import { defaultBase, detectLockfiles, readAtRef, readWorkingTree, refExists } from "./git.js";
import { upsertPullRequestComment } from "./github.js";
import { onlineFindings } from "./registry.js";
import { exceeds, formatJson, formatMarkdown, formatText, type FileReport, type Report } from "./report.js";
import type { Severity } from "./types.js";

const VERSION = "0.1.0";

const HELP = `lockray ${VERSION}: X-ray your lockfile diffs

Usage
  lockray [options]                 compare lockfiles against a git ref
  lockray <old-lockfile> <new-lockfile>   compare two files directly

Options
  -b, --base <ref>        git ref to compare against (default: HEAD, or origin/$GITHUB_BASE_REF in CI)
      --head <ref>        git ref to compare (default: the working tree)
  -f, --file <path>       lockfile to check (repeatable; default: auto-detect)
      --format <fmt>      text | markdown | json (default: text)
  -o, --output <path>     write the report to a file instead of stdout
      --fail-on <level>   exit 1 on findings at or above: high | medium | low | info | none (default: high)
      --allow-host <host> extra trusted tarball host, e.g. your private registry (repeatable)
      --online            also check the npm registry: fresh releases, brand-new packages,
                          deprecations, versions that don't exist
      --min-age <days>    with --online, flag versions published fewer than N days ago (default: 3)
      --comment           in GitHub Actions, post the report as a sticky PR comment (needs GITHUB_TOKEN)
  -h, --help              show this help
  -v, --version           show the version

Supports package-lock.json, npm-shrinkwrap.json, pnpm-lock.yaml (v6, v9) and yarn.lock (Yarn Classic).`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: "string", short: "b" },
      head: { type: "string" },
      file: { type: "string", short: "f", multiple: true },
      format: { type: "string", default: "text" },
      output: { type: "string", short: "o" },
      "fail-on": { type: "string", default: "high" },
      "allow-host": { type: "string", multiple: true },
      online: { type: "boolean" },
      "min-age": { type: "string", default: "3" },
      comment: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log(VERSION);
    return 0;
  }

  const failOn = values["fail-on"] as Severity | "none";
  if (!["high", "medium", "low", "info", "none"].includes(failOn)) throw new Error(`--fail-on must be high, medium, low, info or none`);
  const format = values.format!;
  if (!["text", "markdown", "json"].includes(format)) throw new Error(`--format must be text, markdown or json`);
  const allowedHosts = (values["allow-host"] ?? []).flatMap((h) => h.split(",")).map((h) => h.trim()).filter(Boolean);

  let report: Report;
  if (positionals.length === 2) {
    const [oldPath, newPath] = positionals as [string, string];
    const file = basename(newPath);
    const result = analyzeLockfile(file, readFileSync(oldPath, "utf8"), readFileSync(newPath, "utf8"), { allowedHosts });
    report = { base: oldPath, head: newPath, files: result ? [result] : [] };
  } else if (positionals.length === 0) {
    const base = values.base ?? defaultBase();
    const head = values.head ?? null;
    if (!refExists(base)) throw new Error(`git ref "${base}" not found. In CI, fetch it first (e.g. actions/checkout with fetch-depth: 0).`);
    if (head && !refExists(head)) throw new Error(`git ref "${head}" not found`);
    const files = values.file?.length ? values.file : detectLockfiles(base, head);
    if (!files.length) throw new Error("No package-lock.json, npm-shrinkwrap.json, pnpm-lock.yaml or yarn.lock found in this directory.");

    const results: FileReport[] = [];
    for (const file of files) {
      const r = analyzeLockfile(file, readAtRef(base, file), head ? readAtRef(head, file) : readWorkingTree(file), { allowedHosts });
      if (r) results.push(r);
    }
    const short = (ref: string) => (/^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref);
    report = { base: short(base), head: head ? short(head) : "working tree", files: results };
  } else {
    throw new Error("Pass either no files (git mode) or exactly two lockfiles to compare. See --help.");
  }

  if (values.online) {
    const minReleaseAgeDays = Number(values["min-age"]);
    if (!(minReleaseAgeDays >= 0)) throw new Error("--min-age must be a number of days");
    for (const f of report.files) {
      const { findings, skipped } = await onlineFindings(f.diff.introduced, { minReleaseAgeDays, newPackageDays: 30 });
      f.findings.push(...findings);
      if (skipped) console.error(`lockray: ${f.file}: skipped registry checks for ${skipped} package(s) (private registry or over the limit)`);
    }
  }

  const output = format === "json" ? formatJson(report) : format === "markdown" ? formatMarkdown(report) : formatText(report);
  if (values.output) writeFileSync(values.output, output + "\n");
  else console.log(output);

  if (values.comment) {
    try {
      console.error(`lockray: ${await upsertPullRequestComment(formatMarkdown(report))}`);
    } catch (err) {
      // A failed comment shouldn't hide the verdict; the exit code still reflects the findings.
      console.error(`lockray: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return exceeds(report, failOn) ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`lockray: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  },
);
