/** Builds package-lock.json v3 text from a compact description, for tests. */
export function npmLock(pkgs: Record<string, Record<string, unknown>>): string {
  const packages: Record<string, unknown> = { "": { name: "app", version: "1.0.0" } };
  for (const [path, fields] of Object.entries(pkgs)) {
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    const version = fields.version as string;
    const base = name.startsWith("@") ? name.split("/")[1] : name;
    packages[path] = {
      resolved: `https://registry.npmjs.org/${name}/-/${base}-${version}.tgz`,
      integrity: `sha512-${Buffer.from(`${name}@${version}`).toString("base64")}`,
      ...fields,
    };
  }
  return JSON.stringify({ name: "app", lockfileVersion: 3, requires: true, packages }, null, 2);
}
