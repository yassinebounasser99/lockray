import { describe, expect, it } from "vitest";
import { diffLockfiles } from "./diff.js";
import { parseNpmLock } from "./parse/npm.js";
import { POPULAR_PACKAGES } from "./popular.js";
import { licenseFindings, runRules, typosquatTarget } from "./rules.js";
import { npmLock } from "./test-helpers.js";

const BASE = {
  "node_modules/lodash": { version: "4.17.20", license: "MIT" },
  "node_modules/chalk": { version: "4.1.2" },
};

function check(head: Record<string, Record<string, unknown>>, opts = {}) {
  const base = parseNpmLock(npmLock(BASE));
  const diff = diffLockfiles(base, parseNpmLock(npmLock(head)));
  return [...runRules(diff, opts), ...licenseFindings(diff, base.packages)];
}

const rules = (findings: { rule: string; package: string }[]) => findings.map((f) => `${f.rule}:${f.package}`).sort();

describe("runRules", () => {
  it("reports nothing for a routine patch upgrade", () => {
    expect(check({ ...BASE, "node_modules/lodash": { version: "4.17.21", license: "MIT" } })).toEqual([]);
  });

  it("catches lockfile injection: same version, swapped URL and hash", () => {
    const findings = check({
      ...BASE,
      "node_modules/lodash": { version: "4.17.20", license: "MIT", resolved: "https://evil.example.com/lodash.tgz", integrity: "sha512-EVIL" },
    });
    expect(rules(findings)).toEqual(["integrity-changed:lodash", "source-changed:lodash"]);
    expect(findings.every((f) => f.severity === "high")).toBe(true);
  });

  it("flags tarballs from unknown hosts unless allowed", () => {
    const head = { ...BASE, "node_modules/left-pad": { version: "1.3.0", resolved: "https://npm.internal.corp/left-pad/-/left-pad-1.3.0.tgz" } };
    expect(rules(check(head))).toEqual(["untrusted-host:left-pad"]);
    expect(check(head, { allowedHosts: ["npm.internal.corp"] })).toEqual([]);
  });

  it("flags registry URLs that point at a different package", () => {
    const findings = check({
      ...BASE,
      "node_modules/left-pad": { version: "1.3.0", resolved: "https://registry.npmjs.org/evil-pad/-/evil-pad-6.6.6.tgz" },
    });
    expect(rules(findings)).toEqual(["tarball-mismatch:left-pad"]);
  });

  it("accepts scoped and prerelease tarball paths", () => {
    expect(
      check({
        ...BASE,
        "node_modules/@scope/pkg": { version: "1.0.0-rc-2" },
        "node_modules/@babel/core": { version: "7.24.0" },
      }),
    ).toEqual([]);
  });

  it("flags plain HTTP, git and local sources", () => {
    const findings = check({
      ...BASE,
      "node_modules/a-http": { version: "1.0.0", resolved: "http://registry.npmjs.org/a-http/-/a-http-1.0.0.tgz" },
      "node_modules/b-git": { version: "1.0.0", resolved: "git+ssh://git@github.com/x/b-git.git#abc123", integrity: undefined },
      "node_modules/c-local": { version: "1.0.0", resolved: "file:../c-local", integrity: undefined },
    });
    expect(rules(findings)).toEqual(["git-source:b-git", "insecure-source:a-http", "local-source:c-local"]);
  });

  it("flags install scripts and missing or weak integrity", () => {
    const findings = check({
      ...BASE,
      "node_modules/sharp": { version: "0.33.0", hasInstallScript: true },
      "node_modules/nohash": { version: "1.0.0", integrity: undefined },
      "node_modules/oldhash": { version: "1.0.0", integrity: "sha1-abc" },
    });
    expect(rules(findings)).toEqual(["install-script:sharp", "missing-integrity:nohash", "weak-integrity:oldhash"]);
  });

  it("flags likely typosquats of popular packages", () => {
    const findings = check({ ...BASE, "node_modules/lodahs": { version: "1.0.0" }, "node_modules/expresss": { version: "1.0.0" } });
    expect(rules(findings)).toEqual(["typosquat:expresss", "typosquat:lodahs"]);
  });

  it("notes major bumps, downgrades and license changes", () => {
    const findings = check({ "node_modules/lodash": { version: "5.0.0", license: "BUSL-1.1" }, "node_modules/chalk": { version: "3.0.0" } });
    expect(rules(findings)).toEqual(["downgrade:chalk", "license-changed:lodash", "major-bump:lodash"]);
  });
});

describe("typosquatTarget", () => {
  it.each([
    ["reactt", "react"],
    ["react_dom", "react-dom"],
    ["reactdom", "react-dom"],
    ["axois", "axios"],
    ["axioss", "axios"],
    ["lodash", null],
    ["ws", null],
    ["my-own-package", null],
  ])("%s -> %s", (name, target) => {
    expect(typosquatTarget(name)).toBe(target);
  });

  it("doesn't flag popular packages that resemble each other", () => {
    const flagged = [...POPULAR_PACKAGES].filter((p) => typosquatTarget(p));
    expect(flagged).toEqual([]);
  });
});
