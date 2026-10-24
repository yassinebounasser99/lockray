import type { LockedPackage, Lockfile } from "../types.js";

interface NpmEntry {
  name?: string;
  version?: string;
  resolved?: string;
  integrity?: string;
  hasInstallScript?: boolean;
  license?: string;
  dev?: boolean;
  optional?: boolean;
  link?: boolean;
  dependencies?: Record<string, NpmEntry | string>;
}

interface NpmLock {
  lockfileVersion?: number;
  packages?: Record<string, NpmEntry>;
  dependencies?: Record<string, NpmEntry>;
}

/** "node_modules/a/node_modules/@scope/b" -> "@scope/b" */
function nameFromPath(path: string): string {
  const idx = path.lastIndexOf("node_modules/");
  return idx === -1 ? path : path.slice(idx + "node_modules/".length);
}

/**
 * Parses package-lock.json / npm-shrinkwrap.json. Lockfile v2 and v3 use the
 * flat "packages" map; v1 only has the nested "dependencies" tree.
 */
export function parseNpmLock(text: string): Lockfile {
  const lock = JSON.parse(text) as NpmLock;
  const packages = new Map<string, LockedPackage>();

  const add = (name: string, e: NpmEntry) => {
    if (!e.version || e.link) return;
    const key = `${name}@${e.version}`;
    if (packages.has(key)) return;
    packages.set(key, {
      name,
      version: e.version,
      resolved: e.resolved,
      integrity: e.integrity,
      hasInstallScript: e.hasInstallScript,
      license: e.license,
      dev: e.dev,
      optional: e.optional,
    });
  };

  if (lock.packages) {
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (path === "" || !path.includes("node_modules/")) continue; // root project and workspace sources
      add(entry.name ?? nameFromPath(path), entry);
    }
  } else if (lock.dependencies) {
    const walk = (deps: Record<string, NpmEntry | string>) => {
      for (const [name, entry] of Object.entries(deps)) {
        if (typeof entry === "string") continue;
        add(name, entry);
        if (entry.dependencies) walk(entry.dependencies);
      }
    };
    walk(lock.dependencies);
  }

  return { kind: "npm", packages };
}
