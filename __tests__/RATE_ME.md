# Test Suite Quality Rubric (Rate Me)

Use this file to score the suite before merging major feature work.

Score each category from `0` to `5`.

- `0`: missing
- `3`: acceptable
- `5`: strong and reliable

## 1) Realism

Question: do tests execute real production logic paths?

Target examples:
- Root layout notification callback tests use `app/_layout.tsx` directly.
- Hook tests call hook APIs, not copied logic.

## 2) Failure Coverage

Question: do we test what happens when things go wrong?

Target examples:
- permission denied
- missing auth token
- missing backend URL
- failed network save
- WebSocket retry exhaustion

## 3) Determinism

Question: will tests pass/fail the same way tomorrow?

Target examples:
- frozen clock for date-sensitive UI
- controlled async timing with fake timers where needed

## 4) Signal Quality

Question: when a test fails, does it clearly explain what broke?

Target examples:
- behavior-based test names
- focused assertions
- no noisy assertions on unrelated details

## 5) Maintainability

Question: can a new engineer safely extend tests?

Target examples:
- consistent local setup across test files (or explicit shared helper imports)
- clear docs in `__tests__/README.md`
- minimal mocking of internals

## 6) Coverage Discipline

Question: do coverage gates protect core code paths?

Target examples:
- coverage collection for core hooks/layout/components
- threshold enforcement in Jest config

## Release Recommendation

- `24-30`: strong, ready to ship
- `16-23`: usable but risky, improve weak categories
- `<16`: high risk, prioritize test debt before shipping

## Quick Review Checklist

Before PR merge, confirm:

1. `npm run ci:test -- --watchAll=false` passes.
2. `npm run ci:test -- --watchAll=false --coverage` passes.
3. New or changed behavior has at least one regression test.
