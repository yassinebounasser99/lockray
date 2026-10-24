import type { Report } from "./report.js";
import { RULES } from "./ruledocs.js";
import type { Finding, LockfileKind, Severity } from "./types.js";

const LEVEL: Record<Severity, "error" | "warning" | "note"> = { high: "error", medium: "warning", low: "note", info: "note" };
const SECURITY_SEVERITY: Record<Severity, string> = { high: "8.0", medium: "5.0", low: "3.0", info: "1.0" };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 1-based line of the package's entry in the lockfile, so code scanning can point at it. */
export function lineOf(kind: LockfileKind, text: string, name: string, version?: string): number {
  const n = escapeRe(name);
  const v = version ? escapeRe(version.split(/[, ·]/)[0]!) : "";
  const patterns =
    kind === "npm"
      ? [new RegExp(`^\\s*"(?:[^"]*/)?node_modules/${n}"\\s*:`)]
      : kind === "pnpm"
        ? [new RegExp(`^\\s*'?/?${n}@${v}`), new RegExp(`^\\s*'?/?${n}@`)]
        : [new RegExp(`^"?${n}@`), new RegExp(`[ ,"]${n}@`)];

  const lines = text.split("\n");
  for (const re of patterns) {
    const idx = lines.findIndex((l) => re.test(l));
    if (idx !== -1) return idx + 1;
  }
  return 1;
}

export interface SarifInput {
  report: Report;
  /** Lockfile text at head, keyed by path, for line numbers */
  texts: Record<string, { kind: LockfileKind; text: string } | undefined>;
  version: string;
}

export function formatSarif({ report, texts, version }: SarifInput): string {
  const used = new Set<string>();
  const results = report.files.flatMap((file) =>
    file.findings.map((f: Finding) => {
      used.add(f.rule);
      const src = texts[file.file];
      return {
        ruleId: f.rule,
        level: LEVEL[f.severity],
        message: { text: `${f.package}${f.version ? `@${f.version}` : ""}: ${f.message}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: file.file },
              region: { startLine: src ? lineOf(src.kind, src.text, f.package, f.version) : 1 },
            },
          },
        ],
        // Keeps the alert stable across runs so GitHub doesn't open duplicates.
        partialFingerprints: { lockrayFinding: `${f.rule}:${f.package}@${f.version ?? ""}` },
      };
    }),
  );

  const rules = [...used].sort().map((id) => {
    const doc = RULES[id];
    return {
      id,
      name: id.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase()),
      shortDescription: { text: doc?.title ?? id },
      fullDescription: { text: doc?.why ?? id },
      helpUri: "https://github.com/yassinebounasser99/lockray#what-it-checks",
      defaultConfiguration: { level: LEVEL[doc?.severity ?? "low"] },
      properties: { tags: ["security", "supply-chain"], "security-severity": SECURITY_SEVERITY[doc?.severity ?? "low"] },
    };
  });

  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [{ tool: { driver: { name: "lockray", version, informationUri: "https://github.com/yassinebounasser99/lockray", rules } }, results }],
    },
    null,
    2,
  );
}
