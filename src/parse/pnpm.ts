import { parse } from "yaml";
import type { LockedPackage, Lockfile } from "../types.js";

interface PnpmEntry {
  resolution?: { integrity?: string; tarball?: string; repo?: string; commit?: string; type?: string };
  version?: string;
  name?: string;
  dev?: boolean;
  optional?: boolean;
  requiresBuild?: boolean;
  deprecated?: string;
}

interface PnpmLock {
  lockfileVersion?: string | number;
  packages?: Record<string, PnpmEntry>;
}

/**
 * Splits a packages key into name and version.
 *   v9: "lodash@4.17.21", "@babel/core@7.24.0", "is-odd@https://codeload.github.com/..."
 *   v6: "/lodash@4.17.21", "/react-dom@18.2.0(react@18.2.0)"  (peer suffix in parentheses)
 */
function splitKey(key: string): { name: string; version: string } | null {
  const k = key.replace(/^\//, "").replace(/\(.*\)$/, "");
  const at = k.indexOf("@", 1);
  if (at === -1) return null;
  return { name: k.slice(0, at), version: k.slice(at + 1) };
}

function resolvedFrom(r: PnpmEntry["resolution"]): string | undefined {
  if (!r) return undefined;
  if (r.tarball) return r.tarball;
  if (r.repo && r.commit) return `git+${r.repo}#${r.commit}`;
  return undefined; // plain registry package: pnpm only stores the integrity
}

/** Parses pnpm-lock.yaml v6 (pnpm 8) and v9 (pnpm 9+). */
export function parsePnpmLock(text: string): Lockfile {
  const lock = (parse(text) ?? {}) as PnpmLock;
  const major = Number.parseFloat(String(lock.lockfileVersion ?? "0"));
  if (major && major < 6) throw new Error(`pnpm lockfile v${lock.lockfileVersion} isn't supported. Upgrade to pnpm 8 or later (lockfile v6+).`);

  const packages = new Map<string, LockedPackage>();
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    const parsed = splitKey(key);
    if (!parsed) continue;
    // Git and tarball deps are keyed by URL; the real version is in the entry.
    const version = entry.version ?? parsed.version;
    const name = entry.name ?? parsed.name;
    const id = `${name}@${version}`;
    if (packages.has(id)) continue;
    packages.set(id, {
      name,
      version,
      resolved: resolvedFrom(entry.resolution),
      integrity: entry.resolution?.integrity,
      hasInstallScript: entry.requiresBuild || undefined,
      dev: entry.dev,
      optional: entry.optional,
      deprecated: entry.deprecated,
    });
  }
  return { kind: "pnpm", packages };
}
