import type { LockedPackage, Lockfile } from "../types.js";

/** `"@babel/core@^7.0.0", "@babel/core@^7.1.0":` -> "@babel/core" */
function nameFromSpecifiers(header: string): string | null {
  const first = header.replace(/:$/, "").split(",")[0]?.trim().replace(/^"|"$/g, "");
  if (!first) return null;
  // The range starts at the first "@" after a possible scope prefix. For aliases
  // ("string-width-cjs@npm:string-width@^4.2.0") that keeps the alias name, which is what node_modules uses.
  const at = first.indexOf("@", 1);
  return at === -1 ? first : first.slice(0, at);
}

function unquote(v: string): string {
  return v.trim().replace(/^"|"$/g, "");
}

/**
 * Parses yarn.lock v1 (the format Yarn Classic writes). Each block is a
 * header line of specifiers followed by indented `key value` fields.
 */
export function parseYarnLock(text: string): Lockfile {
  const packages = new Map<string, LockedPackage>();
  let current: Partial<LockedPackage> | null = null;

  const flush = () => {
    if (current?.name && current.version) {
      const key = `${current.name}@${current.version}`;
      if (!packages.has(key)) packages.set(key, current as LockedPackage);
    }
    current = null;
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    if (!line.startsWith(" ")) {
      flush();
      const name = nameFromSpecifiers(line);
      current = name ? { name } : null;
      continue;
    }
    if (!current || line.startsWith("    ")) continue; // nested "dependencies:" entries
    const m = line.trim().match(/^"?([\w-]+)"?\s+(.+)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === "version") current.version = unquote(value!);
    else if (key === "resolved") current.resolved = unquote(value!);
    else if (key === "integrity") current.integrity = unquote(value!);
  }
  flush();

  return { kind: "yarn", packages };
}

export function isYarnBerry(text: string): boolean {
  return /^__metadata:/m.test(text);
}
