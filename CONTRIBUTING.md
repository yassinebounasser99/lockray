# Contributing to lockray

Thanks for helping! lockray is small on purpose; the whole engine is a few files in `src/`.

## Setup

```bash
npm install
npm test           # unit tests (vitest)
npm run typecheck
npm run build      # rebuilds dist/cli.mjs (commit it with your change)
npm run build:playground   # builds the browser playground into playground/public
```

## Where things live

| | |
|---|---|
| `src/parse/` | one parser per lockfile format → `name@version → { resolved, integrity, ... }` |
| `src/diff.ts` | added / removed / changed / modified-in-place |
| `src/rules.ts` | offline security rules |
| `src/registry.ts` | `--online` npm registry checks |
| `src/ruledocs.ts` | the title, severity and explanation of every rule |
| `src/report.ts`, `src/sarif.ts` | terminal, markdown, JSON and SARIF output |
| `action.yml` | the GitHub Action |

## Good first contributions

- **Yarn Berry (v2+) lockfile support:** `yarn.lock` files that start with `__metadata:`.
- **Bun** (`bun.lock`) support.
- New rules, especially ones backed by a real-world incident. Include the incident link in the PR.
- False-positive reports with a minimal lockfile pair.

## Rules for rules

- Every rule needs a test with a realistic lockfile, an entry in `src/ruledocs.ts`, and a row in the README table.
- Prefer precision over recall. A noisy rule teaches people to ignore the comment.
- Never execute or install anything from the lockfile under review.
