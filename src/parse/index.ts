import type { Lockfile } from "../types.js";
import { parseNpmLock } from "./npm.js";
import { isYarnBerry, parseYarnLock } from "./yarn.js";

export const SUPPORTED_LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock"];

export function parseLockfile(path: string, text: string): Lockfile {
  if (path.endsWith(".json")) return parseNpmLock(text);
  if (path.endsWith("yarn.lock")) {
    if (isYarnBerry(text)) throw new Error("Yarn 2+ (berry) lockfiles aren't supported yet. Yarn Classic (v1) is.");
    return parseYarnLock(text);
  }
  throw new Error(`Unsupported lockfile: ${path}. Supported: ${SUPPORTED_LOCKFILES.join(", ")}`);
}

/** An absent lockfile (e.g. newly added in this PR) diffs as empty. */
export function emptyLockfile(kind: Lockfile["kind"]): Lockfile {
  return { kind, packages: new Map() };
}
