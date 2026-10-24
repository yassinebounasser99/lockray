#!/usr/bin/env node

// src/cli.ts
import { readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";

// src/diff.ts
function byName(lock) {
  const map = /* @__PURE__ */ new Map();
  for (const pkg of lock.packages.values()) {
    const list2 = map.get(pkg.name) ?? [];
    list2.push(pkg);
    map.set(pkg.name, list2);
  }
  return map;
}
var versions = (list2 = []) => list2.map((p) => p.version).sort();
function sameSource(a, b) {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const norm = (u) => u.replace("https://registry.yarnpkg.com/", "https://registry.npmjs.org/").replace(/#.*$/, "");
  return norm(a) === norm(b);
}
function diffLockfiles(base, head) {
  const baseNames = byName(base);
  const headNames = byName(head);
  const added = [];
  const removed = [];
  const upgraded = [];
  const introduced = [];
  const modified = [];
  for (const [key, after] of head.packages) {
    const before = base.packages.get(key);
    if (!before) {
      introduced.push(after);
      if (!baseNames.has(after.name)) added.push(after);
      continue;
    }
    const integrityChanged = Boolean(before.integrity && after.integrity && before.integrity !== after.integrity);
    if (integrityChanged || !sameSource(before.resolved, after.resolved)) modified.push({ before, after });
  }
  for (const [name, list2] of baseNames) {
    const next = headNames.get(name);
    if (!next) {
      removed.push(...list2);
      continue;
    }
    const from = versions(list2);
    const to = versions(next);
    if (from.join() !== to.join()) upgraded.push({ name, from, to });
  }
  const sort = (xs) => xs.sort((a, b) => a.name.localeCompare(b.name));
  return {
    added: sort(added),
    removed: sort(removed),
    upgraded: sort(upgraded),
    introduced: sort(introduced),
    modified: modified.sort((a, b) => a.after.name.localeCompare(b.after.name))
  };
}

// src/parse/npm.ts
function nameFromPath(path) {
  const idx = path.lastIndexOf("node_modules/");
  return idx === -1 ? path : path.slice(idx + "node_modules/".length);
}
function parseNpmLock(text) {
  const lock = JSON.parse(text);
  const packages = /* @__PURE__ */ new Map();
  const add = (name, e) => {
    if (!e.version || e.link) return;
    const key = `${name}@${e.version}`;
    if (packages.has(key)) return;
    packages.set(key, {
      name,
      version: e.version,
      resolved: e.resolved,
      integrity: e.integrity,
      hasInstallScript: e.hasInstallScript,
      license: e.license,
      dev: e.dev,
      optional: e.optional
    });
  };
  if (lock.packages) {
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (path === "" || !path.includes("node_modules/")) continue;
      add(entry.name ?? nameFromPath(path), entry);
    }
  } else if (lock.dependencies) {
    const walk = (deps) => {
      for (const [name, entry] of Object.entries(deps)) {
        if (typeof entry === "string") continue;
        add(name, entry);
        if (entry.dependencies) walk(entry.dependencies);
      }
    };
    walk(lock.dependencies);
  }
  return { kind: "npm", packages };
}

// src/parse/yarn.ts
function nameFromSpecifiers(header) {
  const first = header.replace(/:$/, "").split(",")[0]?.trim().replace(/^"|"$/g, "");
  if (!first) return null;
  const alias = first.match(/@npm:(@?[^@]+)@/);
  if (alias) return alias[1];
  const at = first.indexOf("@", 1);
  return at === -1 ? first : first.slice(0, at);
}
function unquote(v) {
  return v.trim().replace(/^"|"$/g, "");
}
function parseYarnLock(text) {
  const packages = /* @__PURE__ */ new Map();
  let current = null;
  const flush = () => {
    if (current?.name && current.version) {
      const key = `${current.name}@${current.version}`;
      if (!packages.has(key)) packages.set(key, current);
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
    if (!current || line.startsWith("    ")) continue;
    const m = line.trim().match(/^"?([\w-]+)"?\s+(.+)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === "version") current.version = unquote(value);
    else if (key === "resolved") current.resolved = unquote(value);
    else if (key === "integrity") current.integrity = unquote(value);
  }
  flush();
  return { kind: "yarn", packages };
}
function isYarnBerry(text) {
  return /^__metadata:/m.test(text);
}

// src/parse/index.ts
var SUPPORTED_LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock"];
function parseLockfile(path, text) {
  if (path.endsWith(".json")) return parseNpmLock(text);
  if (path.endsWith("yarn.lock")) {
    if (isYarnBerry(text)) throw new Error("Yarn 2+ (berry) lockfiles aren't supported yet. Yarn Classic (v1) is.");
    return parseYarnLock(text);
  }
  throw new Error(`Unsupported lockfile: ${path}. Supported: ${SUPPORTED_LOCKFILES.join(", ")}`);
}
function emptyLockfile(kind) {
  return { kind, packages: /* @__PURE__ */ new Map() };
}

// src/popular.ts
var POPULAR_PACKAGES = /* @__PURE__ */ new Set([
  "react",
  "react-dom",
  "react-router",
  "react-router-dom",
  "react-redux",
  "react-is",
  "preact",
  "next",
  "vue",
  "vue-router",
  "vuex",
  "svelte",
  "angular",
  "@angular/core",
  "solid-js",
  "astro",
  "nuxt",
  "gatsby",
  "remix",
  "vite",
  "webpack",
  "webpack-cli",
  "rollup",
  "esbuild",
  "parcel",
  "babel-loader",
  "@babel/core",
  "@babel/preset-env",
  "typescript",
  "ts-node",
  "tsx",
  "eslint",
  "prettier",
  "jest",
  "vitest",
  "mocha",
  "chai",
  "sinon",
  "cypress",
  "playwright",
  "puppeteer",
  "supertest",
  "nodemon",
  "concurrently",
  "express",
  "koa",
  "fastify",
  "hapi",
  "nestjs",
  "@nestjs/core",
  "body-parser",
  "cookie-parser",
  "cors",
  "helmet",
  "morgan",
  "multer",
  "compression",
  "express-session",
  "passport",
  "jsonwebtoken",
  "bcrypt",
  "bcryptjs",
  "argon2",
  "crypto-js",
  "axios",
  "node-fetch",
  "got",
  "request",
  "superagent",
  "ky",
  "undici",
  "socket.io",
  "socket.io-client",
  "ws",
  "lodash",
  "lodash.merge",
  "underscore",
  "ramda",
  "immer",
  "immutable",
  "rxjs",
  "moment",
  "dayjs",
  "date-fns",
  "luxon",
  "chalk",
  "colors",
  "color",
  "kleur",
  "picocolors",
  "commander",
  "yargs",
  "minimist",
  "inquirer",
  "ora",
  "boxen",
  "figlet",
  "debug",
  "winston",
  "pino",
  "bunyan",
  "dotenv",
  "cross-env",
  "config",
  "uuid",
  "nanoid",
  "shortid",
  "classnames",
  "clsx",
  "zod",
  "yup",
  "joi",
  "ajv",
  "validator",
  "class-validator",
  "mongoose",
  "mongodb",
  "mysql",
  "mysql2",
  "pg",
  "sqlite3",
  "sequelize",
  "typeorm",
  "prisma",
  "@prisma/client",
  "knex",
  "redis",
  "ioredis",
  "graphql",
  "apollo-server",
  "@apollo/client",
  "styled-components",
  "@emotion/react",
  "tailwindcss",
  "postcss",
  "autoprefixer",
  "sass",
  "less",
  "bootstrap",
  "jquery",
  "three",
  "d3",
  "chart.js",
  "echarts",
  "leaflet",
  "mapbox-gl",
  "sharp",
  "jimp",
  "canvas",
  "pdfkit",
  "puppeteer-core",
  "glob",
  "fast-glob",
  "rimraf",
  "mkdirp",
  "fs-extra",
  "chokidar",
  "graceful-fs",
  "semver",
  "yaml",
  "js-yaml",
  "xml2js",
  "cheerio",
  "jsdom",
  "marked",
  "markdown-it",
  "highlight.js",
  "prismjs",
  "handlebars",
  "ejs",
  "pug",
  "mustache",
  "async",
  "bluebird",
  "p-limit",
  "p-queue",
  "eventemitter3",
  "qs",
  "query-string",
  "form-data",
  "mime",
  "mime-types",
  "electron",
  "electron-builder",
  "firebase",
  "firebase-admin",
  "aws-sdk",
  "@aws-sdk/client-s3",
  "stripe",
  "twilio",
  "nodemailer",
  "openai",
  "@anthropic-ai/sdk",
  "langchain",
  "tslib",
  "core-js",
  "regenerator-runtime",
  "@types/node",
  "@types/react",
  "@types/express",
  "husky",
  "lint-staged",
  "nx",
  "turbo",
  "lerna",
  "zustand",
  "jotai",
  "recoil",
  "redux",
  "@reduxjs/toolkit",
  "swr",
  "@tanstack/react-query",
  "react-hook-form",
  "formik",
  "framer-motion",
  "lucide-react",
  "@mui/material",
  "antd",
  "chakra-ui",
  "@radix-ui/react-dialog",
  "cross-spawn",
  "execa",
  "shelljs",
  "inherits",
  "safe-buffer",
  "readable-stream",
  "string-width",
  "strip-ansi",
  "ansi-styles",
  "supports-color",
  "has-flag",
  "ms",
  "event-stream",
  "ua-parser-js",
  "coa",
  "rc",
  "node-ipc",
  "colors.js",
  "faker",
  "@faker-js/faker"
]);

// src/rules.ts
var DEFAULT_HOSTS = ["registry.npmjs.org", "registry.yarnpkg.com"];
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_2, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
    }
  }
  return d[a.length][b.length];
}
function typosquatTarget(name) {
  if (POPULAR_PACKAGES.has(name) || name.length < 5) return null;
  const squash = (s) => s.replace(/[-_.]/g, "");
  for (const popular of POPULAR_PACKAGES) {
    if (Math.abs(popular.length - name.length) > 2) continue;
    if (squash(popular) === squash(name)) return popular;
    const limit = name.length >= 10 ? 2 : 1;
    if (editDistance(name, popular) <= limit) return popular;
  }
  return null;
}
function classifySource(resolved, allowed) {
  if (!resolved) return { kind: "unknown" };
  if (/^(git\+|git:|github:|gitlab:|bitbucket:)/.test(resolved) || /\.git(#|$)/.test(resolved)) return { kind: "git" };
  if (/^(file:|link:|\.{0,2}\/)/.test(resolved)) return { kind: "file" };
  try {
    const url = new URL(resolved);
    if (url.protocol === "http:") return { kind: "insecure", host: url.host };
    return { kind: allowed.has(url.host) ? "registry" : "foreign-registry", host: url.host };
  } catch {
    return { kind: "unknown" };
  }
}
function tarballMismatch(pkg) {
  if (!pkg.resolved) return null;
  let url;
  try {
    url = new URL(pkg.resolved);
  } catch {
    return null;
  }
  if (!DEFAULT_HOSTS.includes(url.host)) return null;
  const path = decodeURIComponent(url.pathname);
  const basename2 = pkg.name.startsWith("@") ? pkg.name.split("/")[1] : pkg.name;
  if (path === `/${pkg.name}/-/${basename2}-${pkg.version}.tgz`) return null;
  if (path.startsWith(`/${pkg.name}/-/`)) return `points at a different file (${path.split("/").pop()})`;
  return `points at another package (${path})`;
}
function runRules(diff, opts = {}) {
  const allowed = /* @__PURE__ */ new Set([...DEFAULT_HOSTS, ...opts.allowedHosts ?? []]);
  const findings = [];
  const add = (f) => findings.push(f);
  for (const { before, after } of diff.modified) {
    if (before.integrity && after.integrity && before.integrity !== after.integrity) {
      add({
        severity: "high",
        rule: "integrity-changed",
        package: after.name,
        version: after.version,
        message: `Integrity hash changed but the version didn't. A published npm version is immutable, so the tarball was swapped.`
      });
    }
    if (before.resolved !== after.resolved) {
      add({
        severity: "high",
        rule: "source-changed",
        package: after.name,
        version: after.version,
        message: `Download URL changed for the same version: ${before.resolved ?? "(none)"} \u2192 ${after.resolved ?? "(none)"}`
      });
    }
  }
  for (const pkg of diff.introduced) {
    const source = classifySource(pkg.resolved, allowed);
    switch (source.kind) {
      case "insecure":
        add({ severity: "high", rule: "insecure-source", package: pkg.name, version: pkg.version, message: `Downloaded over plain HTTP from ${source.host}` });
        break;
      case "foreign-registry":
        add({
          severity: "high",
          rule: "untrusted-host",
          package: pkg.name,
          version: pkg.version,
          message: `Tarball comes from ${source.host}, not the npm registry. Allow it with --allow-host if this is your private registry.`
        });
        break;
      case "git":
        add({ severity: "medium", rule: "git-source", package: pkg.name, version: pkg.version, message: `Installed from a git repository: ${pkg.resolved}` });
        break;
      case "file":
        add({ severity: "low", rule: "local-source", package: pkg.name, version: pkg.version, message: `Installed from a local path: ${pkg.resolved}` });
        break;
      case "registry": {
        const mismatch = tarballMismatch(pkg);
        if (mismatch) {
          add({ severity: "high", rule: "tarball-mismatch", package: pkg.name, version: pkg.version, message: `Registry URL ${mismatch}: ${pkg.resolved}` });
        }
        break;
      }
    }
    if (source.kind !== "git" && source.kind !== "file") {
      if (!pkg.integrity) {
        add({ severity: "medium", rule: "missing-integrity", package: pkg.name, version: pkg.version, message: "No integrity hash, so the download can't be verified" });
      } else if (!/sha(256|384|512)-/.test(pkg.integrity)) {
        add({ severity: "low", rule: "weak-integrity", package: pkg.name, version: pkg.version, message: "Only a SHA-1 integrity hash" });
      }
    }
    if (pkg.hasInstallScript) {
      add({
        severity: "medium",
        rule: "install-script",
        package: pkg.name,
        version: pkg.version,
        message: "Runs an install script (preinstall/install/postinstall) on every npm install"
      });
    }
  }
  for (const pkg of diff.added) {
    const target = typosquatTarget(pkg.name);
    if (target) {
      add({ severity: "medium", rule: "typosquat", package: pkg.name, version: pkg.version, message: `Name is suspiciously close to the popular package "${target}"` });
    }
  }
  for (const up of diff.upgraded) {
    const major = (v) => Number(v.split(".")[0]);
    const fresh = up.to.filter((v) => !up.from.includes(v));
    const kept = up.to.filter((v) => up.from.includes(v));
    const maxFrom = Math.max(...up.from.map(major));
    const newMajors = fresh.filter((v) => major(v) > maxFrom);
    if (newMajors.length) {
      const message = kept.length ? `New major version ${newMajors.join(", ")} installed alongside ${kept.join(", ")}` : `Major version bump ${up.from.join(", ")} \u2192 ${up.to.join(", ")}`;
      add({ severity: "info", rule: "major-bump", package: up.name, version: newMajors.join(", "), message });
    }
    if (fresh.length && Math.max(...up.to.map(major)) < maxFrom) {
      add({ severity: "low", rule: "downgrade", package: up.name, version: up.to.join(", "), message: `Downgraded ${up.from.join(", ")} \u2192 ${up.to.join(", ")}` });
    }
  }
  return findings;
}
function licenseFindings(diff, before) {
  const out = [];
  const previous = /* @__PURE__ */ new Map();
  for (const p of before.values()) if (p.license) previous.set(p.name, p.license);
  for (const p of diff.introduced) {
    const old = previous.get(p.name);
    if (old && p.license && old !== p.license) {
      out.push({ severity: "low", rule: "license-changed", package: p.name, version: p.version, message: `License changed from ${old} to ${p.license}` });
    }
  }
  return out;
}

// src/analyze.ts
function analyzeLockfile(file, baseText, headText, opts = {}) {
  if (baseText === headText) return null;
  const kind = file.endsWith(".json") ? "npm" : "yarn";
  const base = baseText === null ? emptyLockfile(kind) : parseLockfile(file, baseText);
  const head = headText === null ? emptyLockfile(kind) : parseLockfile(file, headText);
  const diff = diffLockfiles(base, head);
  return { file, diff, findings: [...runRules(diff, opts), ...licenseFindings(diff, base.packages)] };
}

// src/git.ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}
function readAtRef(ref, path) {
  try {
    return git(["show", `${ref}:./${path}`]);
  } catch {
    return null;
  }
}
function readWorkingTree(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}
function refExists(ref) {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}
function detectLockfiles(base, head) {
  return SUPPORTED_LOCKFILES.filter((f) => readWorkingTree(f) !== null || readAtRef(base, f) !== null || head && readAtRef(head, f) !== null);
}
function defaultBase() {
  const target = process.env.GITHUB_BASE_REF;
  return target ? `origin/${target}` : "HEAD";
}

// src/types.ts
var SEVERITY_ORDER = ["high", "medium", "low", "info"];

// src/report.ts
function countBySeverity(report) {
  const counts = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of report.files) for (const x of f.findings) counts[x.severity]++;
  return counts;
}
function exceeds(report, failOn) {
  if (failOn === "none") return false;
  const limit = SEVERITY_ORDER.indexOf(failOn);
  return report.files.some((f) => f.findings.some((x) => SEVERITY_ORDER.indexOf(x.severity) <= limit));
}
var sortFindings = (xs) => [...xs].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.package.localeCompare(b.package));
var useColor = () => process.stdout.isTTY && !process.env.NO_COLOR;
var paint = (code) => (s) => useColor() ? `\x1B[${code}m${s}\x1B[0m` : s;
var c = { red: paint("31"), yellow: paint("33"), blue: paint("34"), gray: paint("90"), bold: paint("1"), green: paint("32") };
var SEV_TEXT = {
  high: (s) => c.bold(c.red(s)),
  medium: c.yellow,
  low: c.blue,
  info: c.gray
};
function formatText(report) {
  const out = [];
  out.push(c.bold(`lockray`) + c.gray(`  ${report.base} \u2192 ${report.head}`));
  if (!report.files.length) {
    out.push("", "No lockfile changes.");
    return out.join("\n");
  }
  for (const f of report.files) {
    const { diff } = f;
    out.push("", c.bold(f.file));
    out.push(
      c.gray(`  +${diff.added.length} added  \u2191${diff.upgraded.length} changed  -${diff.removed.length} removed  ${diff.modified.length ? c.red(`\u26A0 ${diff.modified.length} modified in place`) : ""}`)
    );
    if (!f.findings.length) {
      out.push(c.green("  \u2713 No issues found"));
      continue;
    }
    for (const x of sortFindings(f.findings)) {
      out.push(`  ${SEV_TEXT[x.severity](x.severity.toUpperCase().padEnd(6))} ${c.bold(x.package)}${x.version ? c.gray(`@${x.version}`) : ""} ${c.gray(`[${x.rule}]`)}`);
      out.push(`         ${x.message}`);
    }
  }
  const counts = countBySeverity(report);
  out.push("", SEVERITY_ORDER.filter((s) => counts[s]).map((s) => SEV_TEXT[s](`${counts[s]} ${s}`)).join(c.gray(" \xB7 ")) || c.green("All clear"));
  return out.join("\n");
}
var COMMENT_MARKER = "<!-- lockray-report -->";
var SEV_ICON = { high: "\u{1F534}", medium: "\u{1F7E0}", low: "\u{1F535}", info: "\u26AA" };
var esc = (s) => s.replace(/\|/g, "\\|").replace(/</g, "&lt;");
function list(title, items, limit = 50) {
  if (!items.length) return "";
  const shown = items.slice(0, limit).map((i) => `- ${i}`);
  if (items.length > limit) shown.push(`- \u2026and ${items.length - limit} more`);
  return `<details><summary>${title} (${items.length})</summary>

${shown.join("\n")}

</details>
`;
}
function formatMarkdown(report) {
  const counts = countBySeverity(report);
  const parts = [COMMENT_MARKER, "### \u{1F52C} lockray: lockfile review"];
  if (!report.files.length) {
    parts.push("No lockfile changes in this PR.");
    return parts.join("\n\n");
  }
  const verdict = counts.high ? `**${counts.high} high-severity issue${counts.high > 1 ? "s" : ""}.** Review before merging.` : counts.medium ? `**${counts.medium} thing${counts.medium > 1 ? "s" : ""} worth a look.**` : "\u2705 **No supply-chain issues found.**";
  parts.push(verdict);
  for (const f of report.files) {
    const { diff } = f;
    const summary = [`**${diff.added.length}** added`, `**${diff.upgraded.length}** changed`, `**${diff.removed.length}** removed`];
    if (diff.modified.length) summary.push(`\u26A0\uFE0F **${diff.modified.length}** modified in place`);
    let section = `#### \`${f.file}\`
${summary.join(" \xB7 ")}
`;
    if (f.findings.length) {
      section += `
| | Package | Issue |
|---|---|---|
`;
      section += sortFindings(f.findings).map((x) => `| ${SEV_ICON[x.severity]} | \`${esc(x.package)}${x.version ? `@${esc(x.version)}` : ""}\` | ${esc(x.message)} <sub>\`${x.rule}\`</sub> |`).join("\n");
      section += "\n";
    }
    section += "\n" + list("Added", diff.added.map((p) => `\`${p.name}@${p.version}\``));
    section += list("Changed", diff.upgraded.map((u) => `\`${u.name}\` ${u.from.join(", ")} \u2192 ${u.to.join(", ")}`));
    section += list("Removed", diff.removed.map((p) => `\`${p.name}@${p.version}\``));
    parts.push(section.trim());
  }
  parts.push(`<sub>Compared \`${report.base}\` \u2192 \`${report.head}\` with [lockray](https://github.com/yassinebounasser99/lockray)</sub>`);
  return parts.join("\n\n");
}
function formatJson(report) {
  return JSON.stringify(
    {
      base: report.base,
      head: report.head,
      summary: countBySeverity(report),
      files: report.files.map((f) => ({
        file: f.file,
        added: f.diff.added.map((p) => `${p.name}@${p.version}`),
        removed: f.diff.removed.map((p) => `${p.name}@${p.version}`),
        changed: f.diff.upgraded,
        modified: f.diff.modified.map((m) => `${m.after.name}@${m.after.version}`),
        findings: sortFindings(f.findings)
      }))
    },
    null,
    2
  );
}

// src/cli.ts
var VERSION = "0.1.0";
var HELP = `lockray ${VERSION}: X-ray your lockfile diffs

Usage
  lockray [options]                 compare lockfiles against a git ref
  lockray <old-lockfile> <new-lockfile>   compare two files directly

Options
  -b, --base <ref>        git ref to compare against (default: HEAD, or origin/$GITHUB_BASE_REF in CI)
      --head <ref>        git ref to compare (default: the working tree)
  -f, --file <path>       lockfile to check (repeatable; default: auto-detect)
      --format <fmt>      text | markdown | json (default: text)
  -o, --output <path>     write the report to a file instead of stdout
      --fail-on <level>   exit 1 on findings at or above: high | medium | low | info | none (default: high)
      --allow-host <host> extra trusted tarball host, e.g. your private registry (repeatable)
  -h, --help              show this help
  -v, --version           show the version

Supports package-lock.json, npm-shrinkwrap.json and yarn.lock (Yarn Classic).`;
function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: "string", short: "b" },
      head: { type: "string" },
      file: { type: "string", short: "f", multiple: true },
      format: { type: "string", default: "text" },
      output: { type: "string", short: "o" },
      "fail-on": { type: "string", default: "high" },
      "allow-host": { type: "string", multiple: true },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" }
    }
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  const failOn = values["fail-on"];
  if (!["high", "medium", "low", "info", "none"].includes(failOn)) throw new Error(`--fail-on must be high, medium, low, info or none`);
  const format = values.format;
  if (!["text", "markdown", "json"].includes(format)) throw new Error(`--format must be text, markdown or json`);
  const allowedHosts = (values["allow-host"] ?? []).flatMap((h) => h.split(",")).map((h) => h.trim()).filter(Boolean);
  let report;
  if (positionals.length === 2) {
    const [oldPath, newPath] = positionals;
    const file = basename(newPath);
    const result = analyzeLockfile(file, readFileSync2(oldPath, "utf8"), readFileSync2(newPath, "utf8"), { allowedHosts });
    report = { base: oldPath, head: newPath, files: result ? [result] : [] };
  } else if (positionals.length === 0) {
    const base = values.base ?? defaultBase();
    const head = values.head ?? null;
    if (!refExists(base)) throw new Error(`git ref "${base}" not found. In CI, fetch it first (e.g. actions/checkout with fetch-depth: 0).`);
    if (head && !refExists(head)) throw new Error(`git ref "${head}" not found`);
    const files = values.file?.length ? values.file : detectLockfiles(base, head);
    if (!files.length) throw new Error("No package-lock.json, npm-shrinkwrap.json or yarn.lock found in this directory.");
    const results = [];
    for (const file of files) {
      const r = analyzeLockfile(file, readAtRef(base, file), head ? readAtRef(head, file) : readWorkingTree(file), { allowedHosts });
      if (r) results.push(r);
    }
    const short = (ref) => /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
    report = { base: short(base), head: head ? short(head) : "working tree", files: results };
  } else {
    throw new Error("Pass either no files (git mode) or exactly two lockfiles to compare. See --help.");
  }
  const output = format === "json" ? formatJson(report) : format === "markdown" ? formatMarkdown(report) : formatText(report);
  if (values.output) writeFileSync(values.output, output + "\n");
  else console.log(output);
  return exceeds(report, failOn) ? 1 : 0;
}
try {
  process.exitCode = main();
} catch (err) {
  console.error(`lockray: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 2;
}
