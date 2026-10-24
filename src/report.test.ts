import { describe, expect, it } from "vitest";
import { collapseFindings, exceeds, formatMarkdown, type Report } from "./report.js";
import type { Finding } from "./types.js";

const f = (pkg: string, rule = "fresh-release", version = "4.65.0"): Finding => ({ severity: "medium", rule, package: pkg, version, message: "m" });

describe("collapseFindings", () => {
  it("folds a scoped family of platform packages into one line", () => {
    const xs = ["darwin-x64", "linux-x64-gnu", "win32-x64-msvc"].map((p) => f(`@rollup/rollup-${p}`));
    expect(collapseFindings([...xs, f("rollup")]).map((x) => x.package)).toEqual(["@rollup/*", "rollup"]);
    expect(collapseFindings(xs)[0]?.version).toBe("4.65.0 · 3 packages");
  });

  it("keeps small groups and different rules apart", () => {
    const xs = [f("@a/one"), f("@a/two"), f("@a/three", "install-script")];
    expect(collapseFindings(xs)).toHaveLength(3);
  });
});

describe("reports", () => {
  const report: Report = {
    base: "main",
    head: "feature",
    files: [
      {
        file: "package-lock.json",
        diff: { added: [], removed: [], upgraded: [], introduced: [], modified: [] },
        findings: [{ severity: "high", rule: "untrusted-host", package: "left-pad", version: "1.3.0", message: "Tarball comes from evil|host" }],
      },
    ],
  };

  it("fails on findings at or above the threshold", () => {
    expect(exceeds(report, "high")).toBe(true);
    expect(exceeds(report, "none")).toBe(false);
    expect(exceeds({ ...report, files: [] }, "info")).toBe(false);
  });

  it("renders a markdown comment with a marker and escaped table cells", () => {
    const md = formatMarkdown(report);
    expect(md.startsWith("<!-- lockray-report -->")).toBe(true);
    expect(md).toContain("**1 high-severity issue.**");
    expect(md).toContain("evil\\|host");
  });
});
