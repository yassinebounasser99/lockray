import type { LockDiff, LockedPackage, Lockfile, Tampered, Upgrade } from "./types.js";

function byName(lock: Lockfile): Map<string, LockedPackage[]> {
  const map = new Map<string, LockedPackage[]>();
  for (const pkg of lock.packages.values()) {
    const list = map.get(pkg.name) ?? [];
    list.push(pkg);
    map.set(pkg.name, list);
  }
  return map;
}

const versions = (list: LockedPackage[] = []) => list.map((p) => p.version).sort();

/** The registry host is interchangeable between npm and Yarn's mirror. */
function sameSource(a?: string, b?: string): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const norm = (u: string) => u.replace("https://registry.yarnpkg.com/", "https://registry.npmjs.org/").replace(/#.*$/, "");
  return norm(a) === norm(b);
}

export function diffLockfiles(base: Lockfile, head: Lockfile): LockDiff {
  const baseNames = byName(base);
  const headNames = byName(head);

  const added: LockedPackage[] = [];
  const removed: LockedPackage[] = [];
  const upgraded: Upgrade[] = [];
  const introduced: LockedPackage[] = [];
  const modified: Tampered[] = [];

  for (const [key, after] of head.packages) {
    const before = base.packages.get(key);
    if (!before) {
      introduced.push(after);
      if (!baseNames.has(after.name)) added.push(after);
      continue;
    }
    const integrityChanged = Boolean(before.integrity && after.integrity && before.integrity !== after.integrity);
    if (integrityChanged || !sameSource(before.resolved, after.resolved)) modified.push({ before, after });
  }

  for (const [name, list] of baseNames) {
    const next = headNames.get(name);
    if (!next) {
      removed.push(...list);
      continue;
    }
    const from = versions(list);
    const to = versions(next);
    if (from.join() !== to.join()) upgraded.push({ name, from, to });
  }

  const sort = <T extends { name: string }>(xs: T[]) => xs.sort((a, b) => a.name.localeCompare(b.name));
  return {
    added: sort(added),
    removed: sort(removed),
    upgraded: sort(upgraded),
    introduced: sort(introduced),
    modified: modified.sort((a, b) => a.after.name.localeCompare(b.after.name)),
  };
}
