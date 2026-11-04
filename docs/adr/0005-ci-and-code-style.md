# 0005. CI, code style and protection of main

Date: 2026-11-04
Status: Accepted

## Context

The repository moved to GitHub. Changes must be checked automatically, the code needs one style, and nothing may reach `main` without the owner's approval.

## Decision

- **Biome** is both the linter and the formatter: one fast tool and one config instead of ESLint with Prettier.
- **Rules are strict and errors, not warnings.** On top of the recommended set they enforce what the README asks for: no `any`, no non-null assertions, no `console`, exhaustive hook dependencies. Cognitive complexity is limited to 15.
- **Architecture is checked by the linter.** `domain` imports nothing internal, packages never import from apps, and the renderer cannot import `electron`, `effect` or Node modules.
- **Vendored beUI sources are excluded,** so they stay as published and updates stay simple. `packages/ui/src/components/avatar` is ours and is checked.
- **`.gitattributes` forces LF,** so a Windows checkout and CI see the same bytes.
- **CI runs Lint, Typecheck, Test and Build as separate jobs** on every pull request and on `main`. It has read-only permissions, actions are pinned to commit hashes, and installs use the frozen lockfile.
- **`main` is protected by a ruleset,** kept in `.github/rulesets/protect-main.json`:
  - changes arrive only through a pull request; force pushes and deletion are blocked;
  - a pull request needs an approval from the code owner (`.github/CODEOWNERS`), new commits dismiss it, and the last pusher cannot approve their own push;
  - all four checks must pass on an up-to-date branch, and review threads must be resolved;
  - merges are squash only, which keeps history linear.
- **The repository admin can bypass the ruleset for pull requests only.** GitHub does not let authors approve their own pull requests, so without this the owner could never merge alone. The owner still goes through a pull request.

## Consequences

- Rulesets on a private repository need a paid GitHub plan. On GitHub Free they cannot be enforced until the repository is public.
- Anyone given the admin role can also bypass, so collaborators must get the write role at most.
- The ruleset JSON is a copy for review and re-import. GitHub does not apply it from the repository, so it must be kept in step with the live settings.
- Pinned actions do not update themselves.
