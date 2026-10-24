<h1 align="center">🔬 lockray</h1>

<p align="center"><b>X-ray your lockfile diffs.</b><br>Catch lockfile injection, tampered packages, sneaky install scripts and typosquats before they merge.</p>

<p align="center">
  <a href="https://lockray.vercel.app"><b>▶ Try it in your browser</b></a> ·
  <a href="#github-action-review-every-pr">GitHub Action</a> ·
  <a href="#cli">CLI</a> ·
  <a href="#what-it-checks">Rules</a>
</p>

<p align="center">
  <a href="https://github.com/yassinebounasser99/lockray/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/yassinebounasser99/lockray/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="npm, pnpm, yarn" src="https://img.shields.io/badge/lockfiles-npm%20%7C%20pnpm%20%7C%20yarn-a371f7">
  <img alt="zero runtime dependencies" src="https://img.shields.io/badge/runtime%20deps-0-blue">
  <img alt="SARIF" src="https://img.shields.io/badge/output-SARIF%20%7C%20Markdown%20%7C%20JSON-lightgrey">
  <img alt="MIT" src="https://img.shields.io/badge/license-MIT-lightgrey">
</p>

<p align="center"><img src="docs/demo.svg" alt="lockray catching an injected download URL, a swapped tarball, a plain-HTTP package and a typosquat with an install script" width="100%"></p>

Every dependency update ships a lockfile diff that is thousands of lines long, and nobody reads it. Attackers count on that:

- **Lockfile injection:** change one `resolved` URL so `lodash` downloads from the attacker's server. The PR still says "bump deps".
- **Tampered tarballs:** same version number, different bytes.
- **Install scripts:** a new indirect dependency quietly runs code on every `npm install`.
- **Typosquats:** `expresss`, `lodahs`, `react_dom`.

`npm audit` looks for known vulnerabilities in what's already installed; it doesn't review what a pull request changes in the lockfile. lockray reads that diff before anything is installed and tells you, in plain language, what actually changed and what looks dangerous.

**Try it in 10 seconds**, no install:

```bash
npx github:yassinebounasser99/lockray                         # what did my last install change?
npx github:yassinebounasser99/lockray --base origin/main       # what does this branch change?
```

Or paste two lockfiles into the **[playground](https://lockray.vercel.app)**. It runs entirely in your browser.

## GitHub Action: review every PR

Add this workflow and lockray comments on every pull request that touches a lockfile, failing the check on high-severity findings:

```yaml
# .github/workflows/lockray.yml
name: lockray
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  lockray:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: yassinebounasser99/lockray@v0
```

The comment is **sticky**: re-runs update it instead of adding new ones. Here is a real one, from a [demo PR](https://github.com/yassinebounasser99/lockray/pull/1) that simulated a lockfile injection:

> ### 🔬 lockray: lockfile review
>
> **2 high-severity issues.** Review before merging.
>
> #### `package-lock.json`
> **0** added · **0** changed · **0** removed · ⚠️ **1** modified in place
>
> | | Package | Issue |
> |---|---|---|
> | 🔴 | `picocolors@1.1.1` | Integrity hash changed but the version didn't. A published npm version is immutable, so the tarball was swapped. |
> | 🔴 | `picocolors@1.1.1` | Download URL changed for the same version: `registry.npmjs.org/…` → `evil.example.com/…` |

| Input | Default | |
|---|---|---|
| `fail-on` | `high` | Fail the check at this severity or above: `high`, `medium`, `low`, `info`, `none` |
| `online` | `true` | Check the npm registry too (see below) |
| `min-age` | `3` | Flag versions published fewer than N days ago |
| `allow-host` | | Comma-separated private registry hosts to trust |
| `comment` | `true` | Post the sticky PR comment (the report always goes to the job summary) |
| `sarif` | `false` | Also write a SARIF report (see below) |
| `working-directory` | `.` | Where the lockfile lives |

**Findings in the Security tab.** Set `sarif: true` and upload the report to GitHub code scanning. Alerts point at the exact line in the lockfile:

```yaml
    permissions:
      contents: read
      pull-requests: write
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: yassinebounasser99/lockray@v0
        id: lockray
        with:
          sarif: true
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: ${{ steps.lockray.outputs.sarif-file }}
```

The Action never installs your dependencies: it only reads lockfile text, so it's safe to run on untrusted PRs.

## CLI

```bash
# What did my last `npm install` change? (working tree vs HEAD)
npx github:yassinebounasser99/lockray

# Compare branches
npx github:yassinebounasser99/lockray --base origin/main --head HEAD

# Compare two files, add registry checks, emit JSON
npx github:yassinebounasser99/lockray old.json new.json --online --format json
```

| Option | |
|---|---|
| `-b, --base <ref>` | git ref to compare against (default `HEAD`, or the PR's target branch in CI) |
| `--head <ref>` | git ref to compare (default: the working tree) |
| `-f, --file <path>` | lockfile(s) to check (default: auto-detect) |
| `--format` | `text`, `markdown`, `json` or `sarif` |
| `-o, --output <path>` | write the report to a file |
| `--sarif <path>` | also write a SARIF report for GitHub code scanning |
| `--fail-on <level>` | exit code 1 at this severity or above (default `high`) |
| `--allow-host <host>` | trust a private registry host (repeatable) |
| `--online` | registry checks: fresh releases, brand-new packages, deprecations, versions that don't exist |
| `--min-age <days>` | threshold for fresh releases (default `3`) |
| `--comment` | in GitHub Actions, post the sticky PR comment |

Exit codes: `0` clean, `1` findings at or above `--fail-on`, `2` error.

## What it checks

| Rule | Severity | Catches |
|---|---|---|
| `integrity-changed` | 🔴 high | Same name and version, different hash. Published npm versions are immutable, so the bytes were swapped. |
| `source-changed` | 🔴 high | Same version, different download URL (lockfile injection) |
| `untrusted-host` | 🔴 high | Tarball from a host other than the npm registry (use `--allow-host` for your own) |
| `tarball-mismatch` | 🔴 high | Registry URL that points at a different package or version |
| `insecure-source` | 🔴 high | Downloaded over plain `http://` |
| `not-on-registry` | 🔴 high | *(online)* The version doesn't exist on npm: unpublished or fabricated |
| `install-script` | 🟠 medium | New package runs `preinstall`/`install`/`postinstall` |
| `typosquat` | 🟠 medium | New name one typo (or a swap, or a separator) away from a popular package |
| `git-source` | 🟠 medium | Installed straight from a git repository |
| `missing-integrity` | 🟠 medium | No hash, so the download can't be verified |
| `fresh-release` | 🟠 medium | *(online)* Published in the last few days. Hijacked releases are usually caught within days. |
| `new-package` | 🟠 medium | *(online)* Package first published under 30 days ago |
| `weak-integrity` / `local-source` / `downgrade` / `license-changed` / `deprecated` | 🔵 low | Worth knowing |
| `major-bump` | ⚪ info | Breaking-change territory |

Findings from families of platform-specific packages (e.g. 25 `@rollup/rollup-*` binaries) are folded into one line in the human-readable output.

## Supported lockfiles

| | |
|---|---|
| `package-lock.json` / `npm-shrinkwrap.json` (v1, v2, v3) | ✅ |
| `yarn.lock` (Yarn Classic v1) | ✅ (no install-script data: Yarn doesn't record it) |
| `pnpm-lock.yaml` (v6 from pnpm 8, v9 from pnpm 9+) | ✅ (install scripts recorded in v6 only; v9 dropped `requiresBuild`) |
| Yarn Berry (2+) | 🗺️ planned, PRs welcome |

## How it works

1. Reads the lockfile at both git refs (`git show <ref>:<file>`), so nothing is installed or executed.
2. Parses each side into `name@version → {resolved, integrity, hasInstallScript, license}`.
3. Diffs them into *added*, *removed*, *changed* and *modified in place* (same version, different source or hash).
4. Runs offline rules on everything newly introduced, plus optional registry lookups with bounded concurrency.
5. Renders terminal, markdown or JSON output, and sets the exit code.

There are no runtime dependencies: one bundled file (`dist/cli.mjs`) built with esbuild. The test suite covers parsers, rules, registry checks and reports.

## FAQ

**Does it replace `npm audit` / Dependabot / Renovate?** No, it complements them. They tell you *which* updates to make and which installed versions have known CVEs. lockray reviews *what a given lockfile change actually does*, including changes no advisory database knows about.

**Is it safe to run on pull requests from forks?** Yes. It only reads lockfile text with `git show`; it never installs or executes the dependencies under review. On forked PRs the default token can't comment, so the report goes to the job summary.

**False positive?** Use `--allow-host` for private registries, and please [open an issue](https://github.com/yassinebounasser99/lockray/issues/new?template=false_positive.yml). Precision matters more than recall for a tool like this.

**How do I know lockray itself is safe?** It has no runtime dependencies, and the bundle (`dist/cli.mjs`) is committed unminified so you can read exactly what runs. CI rebuilds it and fails if it doesn't match the source.

## Development

```bash
npm install
npm test          # vitest
npm run typecheck
npm run build     # bundles to dist/cli.mjs (committed so the Action and npx work without a build)
```

## License

MIT
