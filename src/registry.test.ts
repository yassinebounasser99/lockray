import { describe, expect, it } from "vitest";
import { onlineFindings } from "./registry.js";
import type { LockedPackage } from "./types.js";

const now = new Date("2026-10-24T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

const REGISTRY: Record<string, unknown> = {
  lodash: { time: { created: daysAgo(4000), "4.17.21": daysAgo(1500) }, versions: { "4.17.21": {} } },
  "fresh-lib": { time: { created: daysAgo(900), "2.0.0": daysAgo(0.5) }, versions: { "2.0.0": {} } },
  "brand-new": { time: { created: daysAgo(3), "1.0.0": daysAgo(3) }, versions: { "1.0.0": {} } },
  request: { time: { created: daysAgo(5000), "2.88.2": daysAgo(2000) }, versions: { "2.88.2": { deprecated: "request has been deprecated" } } },
  "@scope/pkg": { time: { created: daysAgo(500), "1.0.0": daysAgo(400) }, versions: { "1.0.0": {} } },
};

const fakeFetch = (async (url: string) => {
  const name = decodeURIComponent(url.replace("https://registry.npmjs.org/", ""));
  const doc = REGISTRY[name];
  return doc ? new Response(JSON.stringify(doc), { status: 200 }) : new Response("{}", { status: 404 });
}) as typeof fetch;

const pkg = (name: string, version: string, resolved?: string): LockedPackage => ({
  name,
  version,
  resolved: resolved ?? `https://registry.npmjs.org/${name}/-/${name.split("/").pop()}-${version}.tgz`,
});

const run = (pkgs: LockedPackage[]) => onlineFindings(pkgs, { minReleaseAgeDays: 3, newPackageDays: 30, now, fetchImpl: fakeFetch });

describe("onlineFindings", () => {
  it("passes established packages", async () => {
    expect((await run([pkg("lodash", "4.17.21"), pkg("@scope/pkg", "1.0.0")])).findings).toEqual([]);
  });

  it("flags fresh releases, brand-new packages and deprecations", async () => {
    const { findings } = await run([pkg("fresh-lib", "2.0.0"), pkg("brand-new", "1.0.0"), pkg("request", "2.88.2")]);
    expect(findings.map((f) => `${f.rule}:${f.package}`).sort()).toEqual(["deprecated:request", "fresh-release:fresh-lib", "new-package:brand-new"]);
    expect(findings.find((f) => f.rule === "fresh-release")?.message).toMatch(/12 hours ago/);
  });

  it("flags versions and packages that don't exist on the registry", async () => {
    const { findings } = await run([pkg("lodash", "9.9.9"), pkg("ghost-package", "1.0.0")]);
    expect(findings.map((f) => `${f.rule}:${f.package}`)).toEqual(["not-on-registry:lodash", "not-on-registry:ghost-package"]);
  });

  it("skips packages from private registries", async () => {
    const result = await run([pkg("internal", "1.0.0", "https://npm.corp.local/internal/-/internal-1.0.0.tgz")]);
    expect(result).toEqual({ findings: [], checked: 0, skipped: 1 });
  });

  it("ignores network failures", async () => {
    const failing = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const result = await onlineFindings([pkg("lodash", "4.17.21")], { minReleaseAgeDays: 3, newPackageDays: 30, fetchImpl: failing });
    expect(result.findings).toEqual([]);
  });
});
