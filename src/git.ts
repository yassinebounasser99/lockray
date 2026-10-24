import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { SUPPORTED_LOCKFILES } from "./parse/index.js";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/** Contents of `path` (relative to the current directory) at `ref`, or null if it didn't exist there. */
export function readAtRef(ref: string, path: string): string | null {
  try {
    return git(["show", `${ref}:./${path}`]);
  } catch {
    return null;
  }
}

export function readWorkingTree(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function refExists(ref: string): boolean {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/** Lockfiles in the current directory, at either side of the comparison. */
export function detectLockfiles(base: string, head: string | null): string[] {
  return SUPPORTED_LOCKFILES.filter((f) => readWorkingTree(f) !== null || readAtRef(base, f) !== null || (head && readAtRef(head, f) !== null));
}

/** In a GitHub pull request, compare against the target branch; locally, against HEAD. */
export function defaultBase(): string {
  const target = process.env.GITHUB_BASE_REF;
  return target ? `origin/${target}` : "HEAD";
}
