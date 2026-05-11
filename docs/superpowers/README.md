# Superpowers

Every non-trivial feature in Scrollr ships with a dated design document. This
folder is the archive — written *before* the code, kept *after* the merge.

## Layout

- **`specs/`** — design briefs. The "what and why" that drove a feature.
  Captures the problem, the chosen approach, alternatives considered, and the
  user-facing surface. Roughly one spec per feature, dated by the day work
  began.
- **`plans/`** — implementation plans. The "how" that translates a spec into
  an ordered list of edits. Tracks file-by-file responsibilities, ordering
  constraints, and test strategy. Usually paired 1-to-1 with a spec.

## Why these are public

These documents are the single best way to understand *why* the codebase looks
the way it does. If you're trying to decide whether to file a bug, propose a
change, or understand an unusual pattern, the relevant spec usually answers
the question faster than the code does.

Anything in `handoffs/` is local rolling session state and is intentionally
gitignored.

## Convention

- Filenames are `YYYY-MM-DD-short-slug.md`.
- A spec lands first; its plan follows with the same slug.
- The merge commit that ships the feature references the plan.
- Once shipped, documents are not edited — follow-up work gets a new spec
  rather than rewriting history.
