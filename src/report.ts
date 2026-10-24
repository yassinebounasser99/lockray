import { SEVERITY_ORDER, type Finding, type LockDiff, type Severity } from "./types.js";

export interface FileReport {
  file: string;
  diff: LockDiff;
  findings: Finding[];
}

export interface Report {
  base: string;
  head: string;
  files: FileReport[];
}

export function countBySeverity(report: Report, collapsed = false): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of report.files) for (const x of collapsed ? collapseFindings(f.findings) : f.findings) counts[x.severity]++;
  return counts;
}

export function exceeds(report: Report, failOn: Severity | "none"): boolean {
  if (failOn === "none") return false;
  const limit = SEVERITY_ORDER.indexOf(failOn);
  return report.files.some((f) => f.findings.some((x) => SEVERITY_ORDER.indexOf(x.severity) <= limit));
}

/**
 * Platform-binary families (@rollup/rollup-linux-x64-gnu, @esbuild/darwin-arm64, ...) produce the
 * same finding dozens of times. For human-facing output, fold findings that share a rule, version
 * and scope into one line.
 */
export function collapseFindings(xs: Finding[], min = 3): Finding[] {
  const groups = new Map<string, Finding[]>();
  for (const f of xs) {
    const scope = f.package.startsWith("@") ? f.package.split("/")[0] : null;
    const key = scope ? `${f.rule}|${f.version}|${scope}` : `single|${groups.size}|${f.package}|${f.rule}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const out: Finding[] = [];
  for (const [key, group] of groups) {
    if (group.length < min) {
      out.push(...group);
      continue;
    }
    const scope = key.split("|")[2];
    out.push({ ...group[0]!, package: `${scope}/*`, version: `${group[0]!.version} · ${group.length} packages` });
  }
  return out;
}

const sortFindings = (xs: Finding[]) =>
  [...xs].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.package.localeCompare(b.package));

// ── Terminal ────────────────────────────────────────────────────────────────

const useColor = () => process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = { red: paint("31"), yellow: paint("33"), blue: paint("34"), gray: paint("90"), bold: paint("1"), green: paint("32") };

const SEV_TEXT: Record<Severity, (s: string) => string> = {
  high: (s) => c.bold(c.red(s)),
  medium: c.yellow,
  low: c.blue,
  info: c.gray,
};

export function formatText(report: Report): string {
  const out: string[] = [];
  out.push(c.bold(`lockray`) + c.gray(`  ${report.base} → ${report.head}`));
  if (!report.files.length) {
    out.push("", "No lockfile changes.");
    return out.join("\n");
  }
  for (const f of report.files) {
    const { diff } = f;
    out.push("", c.bold(f.file));
    out.push(
      c.gray(`  +${diff.added.length} added  ↑${diff.upgraded.length} changed  -${diff.removed.length} removed  ${diff.modified.length ? c.red(`⚠ ${diff.modified.length} modified in place`) : ""}`),
    );
    if (!f.findings.length) {
      out.push(c.green("  ✓ No issues found"));
      continue;
    }
    for (const x of sortFindings(collapseFindings(f.findings))) {
      out.push(`  ${SEV_TEXT[x.severity](x.severity.toUpperCase().padEnd(6))} ${c.bold(x.package)}${x.version ? c.gray(`@${x.version}`) : ""} ${c.gray(`[${x.rule}]`)}`);
      out.push(`         ${x.message}`);
    }
  }
  const counts = countBySeverity(report, true);
  out.push("", SEVERITY_ORDER.filter((s) => counts[s]).map((s) => SEV_TEXT[s](`${counts[s]} ${s}`)).join(c.gray(" · ")) || c.green("All clear"));
  return out.join("\n");
}

// ── Markdown (PR comments) ─────────────────────────────────────────────────

export const COMMENT_MARKER = "<!-- lockray-report -->";

const SEV_ICON: Record<Severity, string> = { high: "🔴", medium: "🟠", low: "🔵", info: "⚪" };

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/</g, "&lt;");

function list(title: string, items: string[], limit = 50): string {
  if (!items.length) return "";
  const shown = items.slice(0, limit).map((i) => `- ${i}`);
  if (items.length > limit) shown.push(`- …and ${items.length - limit} more`);
  return `<details><summary>${title} (${items.length})</summary>\n\n${shown.join("\n")}\n\n</details>\n`;
}

export function formatMarkdown(report: Report): string {
  const counts = countBySeverity(report, true);
  const parts: string[] = [COMMENT_MARKER, "### 🔬 lockray: lockfile review"];

  if (!report.files.length) {
    parts.push("No lockfile changes in this PR.");
    return parts.join("\n\n");
  }

  const verdict = counts.high
    ? `**${counts.high} high-severity issue${counts.high > 1 ? "s" : ""}.** Review before merging.`
    : counts.medium
      ? `**${counts.medium} thing${counts.medium > 1 ? "s" : ""} worth a look.**`
      : "✅ **No supply-chain issues found.**";
  parts.push(verdict);

  for (const f of report.files) {
    const { diff } = f;
    const summary = [`**${diff.added.length}** added`, `**${diff.upgraded.length}** changed`, `**${diff.removed.length}** removed`];
    if (diff.modified.length) summary.push(`⚠️ **${diff.modified.length}** modified in place`);
    let section = `#### \`${f.file}\`\n${summary.join(" · ")}\n`;

    if (f.findings.length) {
      section += `\n| | Package | Issue |\n|---|---|---|\n`;
      section += sortFindings(collapseFindings(f.findings))
        .map((x) => `| ${SEV_ICON[x.severity]} | \`${esc(x.package)}${x.version ? `@${esc(x.version)}` : ""}\` | ${esc(x.message)} <sub>\`${x.rule}\`</sub> |`)
        .join("\n");
      section += "\n";
    }

    section += "\n" + list("Added", diff.added.map((p) => `\`${p.name}@${p.version}\``));
    section += list("Changed", diff.upgraded.map((u) => `\`${u.name}\` ${u.from.join(", ")} → ${u.to.join(", ")}`));
    section += list("Removed", diff.removed.map((p) => `\`${p.name}@${p.version}\``));
    parts.push(section.trim());
  }

  parts.push(`<sub>Compared \`${report.base}\` → \`${report.head}\` with [lockray](https://github.com/yassinebounasser99/lockray)</sub>`);
  return parts.join("\n\n");
}

// ── JSON ─────────────────────────────────────────────────────────────────────

export function formatJson(report: Report): string {
  return JSON.stringify(
    {
      base: report.base,
      head: report.head,
      summary: countBySeverity(report),
      files: report.files.map((f) => ({
        file: f.file,
        added: f.diff.added.map((p) => `${p.name}@${p.version}`),
        removed: f.diff.removed.map((p) => `${p.name}@${p.version}`),
        changed: f.diff.upgraded,
        modified: f.diff.modified.map((m) => `${m.after.name}@${m.after.version}`),
        findings: sortFindings(f.findings),
      })),
    },
    null,
    2,
  );
}
