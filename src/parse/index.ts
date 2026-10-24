import type { Lockfile } from "../types.js";
import { parseNpmLock } from "./npm.js";
import { parsePnpmLock } from "./pnpm.js";
import { isYarnBerry, parseYarnLock } from "./yarn.js";

export const SUPPORTED_LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"];

export function lockfileKind(path: string): Lockfile["kind"] {
  if (path.endsWith(".json")) return "npm";
  if (/pnpm-lock\.ya?ml$/.test(path) || path.endsWith(".yaml")) return "pnpm";
  return "yarn";
}

export function parseLockfile(path: string, text: string): Lockfile {
  const kind = lockfileKind(path);
  if (kind === "npm") return parseNpmLock(text);
  if (kind === "pnpm") return parsePnpmLock(text);
  if (isYarnBerry(text)) throw new Error("Yarn 2+ (berry) lockfiles aren't supported yet. Yarn Classic (v1) is.");
  return parseYarnLock(text);
}

/** An absent lockfile (e.g. newly added in this PR) diffs as empty. */
export function emptyLockfile(kind: Lockfile["kind"]): Lockfile {
  return { kind, packages: new Map() };
}
