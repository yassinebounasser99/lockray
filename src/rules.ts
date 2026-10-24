import { POPULAR_PACKAGES } from "./popular.js";
import type { Finding, LockDiff, LockedPackage } from "./types.js";

export interface RuleOptions {
  /** Hosts tarballs may come from, in addition to the public npm registry */
  allowedHosts?: string[];
}

const DEFAULT_HOSTS = ["registry.npmjs.org", "registry.yarnpkg.com"];

/** Optimal string alignment distance: like Levenshtein, but a swap of two adjacent letters ("lodahs") costs 1. */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** Returns the popular package a new name imitates, if any. Compares full names, with and without separators. */
export function typosquatTarget(name: string): string | null {
  if (POPULAR_PACKAGES.has(name) || name.length < 5) return null;
  const squash = (s: string) => s.replace(/[-_.]/g, "");
  for (const popular of POPULAR_PACKAGES) {
    if (Math.abs(popular.length - name.length) > 2) continue;
    // "react_dom" / "reactdom" for "react-dom"
    if (squash(popular) === squash(name)) return popular;
    const limit = name.length >= 10 ? 2 : 1;
    if (editDistance(name, popular) <= limit) return popular;
  }
  return null;
}

type SourceKind = "registry" | "foreign-registry" | "git" | "file" | "insecure" | "unknown";

function classifySource(resolved: string | undefined, allowed: Set<string>): { kind: SourceKind; host?: string } {
  if (!resolved) return { kind: "unknown" };
  if (/^(git\+|git:|github:|gitlab:|bitbucket:)/.test(resolved) || /\.git(#|$)/.test(resolved)) return { kind: "git" };
  if (/^(file:|link:|\.{0,2}\/)/.test(resolved)) return { kind: "file" };
  try {
    const url = new URL(resolved);
    if (url.protocol === "http:") return { kind: "insecure", host: url.host };
    return { kind: allowed.has(url.host) ? "registry" : "foreign-registry", host: url.host };
  } catch {
    return { kind: "unknown" };
  }
}

/** Public-registry tarballs live at /<name>/-/<basename>-<version>.tgz; anything else means the URL was swapped. */
function tarballMismatch(pkg: LockedPackage): string | null {
  if (!pkg.resolved) return null;
  let url: URL;
  try {
    url = new URL(pkg.resolved);
  } catch {
    return null;
  }
  if (!DEFAULT_HOSTS.includes(url.host)) return null; // private registries use their own layouts
  const path = decodeURIComponent(url.pathname);
  const basename = pkg.name.startsWith("@") ? pkg.name.split("/")[1] : pkg.name;
  if (path === `/${pkg.name}/-/${basename}-${pkg.version}.tgz`) return null;
  if (path.startsWith(`/${pkg.name}/-/`)) return `points at a different file (${path.split("/").pop()})`;
  return `points at another package (${path})`;
}


export function runRules(diff: LockDiff, opts: RuleOptions = {}): Finding[] {
  const allowed = new Set([...DEFAULT_HOSTS, ...(opts.allowedHosts ?? [])]);
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);

  // Same version, different bytes: the classic lockfile injection / tampering signal.
  for (const { before, after } of diff.modified) {
    if (before.integrity && after.integrity && before.integrity !== after.integrity) {
      add({
        severity: "high",
        rule: "integrity-changed",
        package: after.name,
        version: after.version,
        message: `Integrity hash changed but the version didn't. A published npm version is immutable, so the tarball was swapped.`,
      });
    }
    if (before.resolved !== after.resolved) {
      add({
        severity: "high",
        rule: "source-changed",
        package: after.name,
        version: after.version,
        message: `Download URL changed for the same version: ${before.resolved ?? "(none)"} → ${after.resolved ?? "(none)"}`,
      });
    }
  }

  for (const pkg of diff.introduced) {
    const source = classifySource(pkg.resolved, allowed);
    switch (source.kind) {
      case "insecure":
        add({ severity: "high", rule: "insecure-source", package: pkg.name, version: pkg.version, message: `Downloaded over plain HTTP from ${source.host}` });
        break;
      case "foreign-registry":
        add({
          severity: "high",
          rule: "untrusted-host",
          package: pkg.name,
          version: pkg.version,
          message: `Tarball comes from ${source.host}, not the npm registry. Allow it with --allow-host if this is your private registry.`,
        });
        break;
      case "git":
        add({ severity: "medium", rule: "git-source", package: pkg.name, version: pkg.version, message: `Installed from a git repository: ${pkg.resolved}` });
        break;
      case "file":
        add({ severity: "low", rule: "local-source", package: pkg.name, version: pkg.version, message: `Installed from a local path: ${pkg.resolved}` });
        break;
      case "registry": {
        const mismatch = tarballMismatch(pkg);
        if (mismatch) {
          add({ severity: "high", rule: "tarball-mismatch", package: pkg.name, version: pkg.version, message: `Registry URL ${mismatch}: ${pkg.resolved}` });
        }
        break;
      }
    }

    if (source.kind !== "git" && source.kind !== "file") {
      if (!pkg.integrity) {
        add({ severity: "medium", rule: "missing-integrity", package: pkg.name, version: pkg.version, message: "No integrity hash, so the download can't be verified" });
      } else if (!/sha(256|384|512)-/.test(pkg.integrity)) {
        add({ severity: "low", rule: "weak-integrity", package: pkg.name, version: pkg.version, message: "Only a SHA-1 integrity hash" });
      }
    }

    if (pkg.hasInstallScript) {
      add({
        severity: "medium",
        rule: "install-script",
        package: pkg.name,
        version: pkg.version,
        message: "Runs an install script (preinstall/install/postinstall) on every npm install",
      });
    }
  }

  for (const pkg of diff.added) {
    const target = typosquatTarget(pkg.name);
    if (target) {
      add({ severity: "medium", rule: "typosquat", package: pkg.name, version: pkg.version, message: `Name is suspiciously close to the popular package "${target}"` });
    }
  }

  for (const up of diff.upgraded) {
    const major = (v: string) => Number(v.split(".")[0]);
    const maxFrom = Math.max(...up.from.map(major));
    const maxTo = Math.max(...up.to.map(major));
    if (maxTo > maxFrom) add({ severity: "info", rule: "major-bump", package: up.name, version: up.to.join(", "), message: `Major version bump ${up.from.join(", ")} → ${up.to.join(", ")}` });
    if (maxTo < maxFrom) add({ severity: "low", rule: "downgrade", package: up.name, version: up.to.join(", "), message: `Downgraded ${up.from.join(", ")} → ${up.to.join(", ")}` });
  }

  return findings;
}

/** License changes are visible offline when the lockfile records licenses (npm). */
export function licenseFindings(diff: LockDiff, before: Map<string, LockedPackage>): Finding[] {
  const out: Finding[] = [];
  const previous = new Map<string, string>();
  for (const p of before.values()) if (p.license) previous.set(p.name, p.license);
  for (const p of diff.introduced) {
    const old = previous.get(p.name);
    if (old && p.license && old !== p.license) {
      out.push({ severity: "low", rule: "license-changed", package: p.name, version: p.version, message: `License changed from ${old} to ${p.license}` });
    }
  }
  return out;
}

