import { describe, expect, it } from "vitest";
import { analyzeLockfile } from "./analyze.js";
import { lineOf, formatSarif } from "./sarif.js";
import { npmLock } from "./test-helpers.js";

describe("lineOf", () => {
  it("finds npm entries, including nested ones", () => {
    const text = npmLock({ "node_modules/a": { version: "1.0.0" }, "node_modules/x/node_modules/lodash": { version: "3.0.0" } });
    expect(text.split("\n")[lineOf("npm", text, "lodash") - 1]).toContain('"node_modules/x/node_modules/lodash"');
  });

  it("finds yarn and pnpm entries", () => {
    expect(lineOf("yarn", '# c\n\n"@babel/core@^7.0.0":\n  version "7.0.0"', "@babel/core")).toBe(3);
    expect(lineOf("pnpm", "packages:\n\n  lodash@4.17.20:\n  lodash@4.17.21:\n", "lodash", "4.17.21")).toBe(4);
  });

  it("falls back to line 1", () => {
    expect(lineOf("npm", "{}", "missing")).toBe(1);
  });
});

describe("formatSarif", () => {
  it("produces SARIF 2.1.0 with rules, levels, security severity and locations", () => {
    const base = npmLock({ "node_modules/lodash": { version: "4.17.21" } });
    const head = npmLock({ "node_modules/lodash": { version: "4.17.21", resolved: "https://evil.example.com/l.tgz" } });
    const file = analyzeLockfile("package-lock.json", base, head)!;
    const sarif = JSON.parse(
      formatSarif({ report: { base: "a", head: "b", files: [file] }, texts: { "package-lock.json": { kind: "npm", text: head } }, version: "0.0.0" }),
    );
    expect(sarif.version).toBe("2.1.0");
    const run = sarif.runs[0];
    expect(run.tool.driver.rules.map((r: { id: string }) => r.id)).toEqual(["source-changed"]);
    expect(run.tool.driver.rules[0].properties["security-severity"]).toBe("8.0");
    expect(run.results[0]).toMatchObject({ ruleId: "source-changed", level: "error" });
    expect(run.results[0].locations[0].physicalLocation.region.startLine).toBeGreaterThan(1);
  });
});
