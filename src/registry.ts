import type { Finding, LockedPackage } from "./types.js";

export interface OnlineOptions {
  /** Flag versions published fewer than this many days ago */
  minReleaseAgeDays: number;
  /** Flag packages whose first release is newer than this */
  newPackageDays: number;
  registry?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
  concurrency?: number;
  /** Stop after this many packages so huge lockfile rewrites stay fast */
  limit?: number;
}

interface Packument {
  time?: Record<string, string>;
  versions?: Record<string, { deprecated?: string }>;
}

const DAY = 86_400_000;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function fromPublicRegistry(pkg: LockedPackage): boolean {
  return !pkg.resolved || /^https:\/\/registry\.(npmjs\.org|yarnpkg\.com)\//.test(pkg.resolved);
}

/**
 * Looks up newly introduced versions on the npm registry. Only packages that
 * resolve from the public registry are checked; private ones are skipped.
 */
export async function onlineFindings(pkgs: LockedPackage[], opts: OnlineOptions): Promise<{ findings: Finding[]; checked: number; skipped: number }> {
  const registry = (opts.registry ?? "https://registry.npmjs.org").replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  const now = (opts.now ?? new Date()).getTime();
  const candidates = pkgs.filter(fromPublicRegistry);
  const limit = opts.limit ?? 300;
  const toCheck = candidates.slice(0, limit);

  const perPackage = await mapLimit(toCheck, opts.concurrency ?? 8, async (pkg): Promise<Finding[]> => {
    const out: Finding[] = [];
    const base = { package: pkg.name, version: pkg.version };
    let res: Response;
    try {
      res = await doFetch(`${registry}/${pkg.name.replace("/", "%2f")}`, { headers: { accept: "application/json" } });
    } catch {
      return out; // network trouble shouldn't fail the review
    }
    if (res.status === 404) {
      out.push({ ...base, severity: "high", rule: "not-on-registry", message: "This package doesn't exist on the npm registry" });
      return out;
    }
    if (!res.ok) return out;

    const doc = (await res.json()) as Packument;
    const manifest = doc.versions?.[pkg.version];
    if (!manifest) {
      out.push({ ...base, severity: "high", rule: "not-on-registry", message: `Version ${pkg.version} doesn't exist on the npm registry (unpublished or fabricated)` });
      return out;
    }
    if (manifest.deprecated && !pkg.deprecated) {
      out.push({ ...base, severity: "low", rule: "deprecated", message: `Deprecated: ${manifest.deprecated}` });
    }

    const published = doc.time?.[pkg.version];
    if (published) {
      const ageDays = (now - Date.parse(published)) / DAY;
      if (ageDays < opts.minReleaseAgeDays) {
        const hours = Math.max(1, Math.round(ageDays * 24));
        out.push({
          ...base,
          severity: "medium",
          rule: "fresh-release",
          message: `Published ${hours < 48 ? `${hours} hours` : `${Math.round(ageDays)} days`} ago. Hijacked releases are usually caught within days, so consider waiting.`,
        });
      }
    }

    const created = doc.time?.created;
    if (created && (now - Date.parse(created)) / DAY < opts.newPackageDays) {
      out.push({ ...base, severity: "medium", rule: "new-package", message: `Package was first published ${Math.max(1, Math.round((now - Date.parse(created)) / DAY))} days ago` });
    }
    return out;
  });

  return { findings: perPackage.flat(), checked: toCheck.length, skipped: pkgs.length - toCheck.length };
}
