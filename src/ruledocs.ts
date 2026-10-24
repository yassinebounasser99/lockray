import type { Severity } from "./types.js";

export interface RuleDoc {
  title: string;
  severity: Severity;
  why: string;
}

/** One place that describes every rule: used by SARIF output, the playground and docs. */
export const RULES: Record<string, RuleDoc> = {
  "integrity-changed": {
    title: "Integrity hash changed for an unchanged version",
    severity: "high",
    why: "Published npm versions are immutable. A different hash for the same name@version means the tarball being installed is not the one the registry published.",
  },
  "source-changed": {
    title: "Download URL changed for an unchanged version",
    severity: "high",
    why: "Lockfile injection: editing a package's resolved URL makes installs fetch attacker-controlled code while the diff looks like routine noise.",
  },
  "untrusted-host": {
    title: "Tarball from a host other than the npm registry",
    severity: "high",
    why: "Packages normally come from registry.npmjs.org. Another host can serve anything; trust it explicitly with --allow-host if it's your private registry.",
  },
  "tarball-mismatch": {
    title: "Registry URL points at a different package or version",
    severity: "high",
    why: "The URL is on the real registry but downloads another package, which is a way to smuggle code past host allowlists.",
  },
  "insecure-source": {
    title: "Package downloaded over plain HTTP",
    severity: "high",
    why: "Unencrypted downloads can be modified in transit.",
  },
  "not-on-registry": {
    title: "Version doesn't exist on the npm registry",
    severity: "high",
    why: "The lockfile references something npm never published, or that was pulled, often because it was malicious.",
  },
  "install-script": {
    title: "New package runs an install script",
    severity: "medium",
    why: "preinstall/install/postinstall scripts run arbitrary code on every developer machine and CI runner that installs the project.",
  },
  typosquat: {
    title: "Name resembles a popular package",
    severity: "medium",
    why: "Typosquatting packages imitate popular names (one typo, a swapped letter, a different separator) to get installed by mistake.",
  },
  "git-source": {
    title: "Installed from a git repository",
    severity: "medium",
    why: "Git dependencies bypass the registry's immutability and malware scanning, and the referenced code can change if a branch is used.",
  },
  "missing-integrity": {
    title: "No integrity hash",
    severity: "medium",
    why: "Without a hash, the package manager can't verify that the downloaded tarball is the expected one.",
  },
  "fresh-release": {
    title: "Version published very recently",
    severity: "medium",
    why: "Hijacked releases are usually detected and pulled within days. Waiting a short cooldown before adopting new versions avoids most of them.",
  },
  "new-package": {
    title: "Package is brand new",
    severity: "medium",
    why: "Most malicious packages are only days or weeks old when they're found.",
  },
  "weak-integrity": { title: "Only a SHA-1 integrity hash", severity: "low", why: "SHA-1 is no longer collision-resistant." },
  "local-source": { title: "Installed from a local path", severity: "low", why: "Worth confirming the path is part of this repository." },
  downgrade: { title: "Package downgraded", severity: "low", why: "Downgrades can reintroduce fixed vulnerabilities." },
  "license-changed": { title: "License changed", severity: "low", why: "A new license may not be compatible with how you use the package." },
  deprecated: { title: "Deprecated package", severity: "low", why: "Deprecated packages no longer receive fixes." },
  "major-bump": { title: "Major version bump", severity: "info", why: "Major versions may contain breaking changes." },
};
