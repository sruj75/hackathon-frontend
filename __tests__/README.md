# Frontend Testing Playbook

This folder is the testing source of truth for the current frontend codebase.

## Why We Test (First Principles)

Tests exist to protect behavior, not to increase line count.

Use this mental model:

1. **Input**: what event/state enters the system.
2. **Transition**: what logic transforms it.
3. **Output**: what user-visible result or side effect happens.

A test is useful only if it verifies a real transition in production code.
If the test rewrites the logic inside the test file, it gives false confidence.

## Non-Negotiable Test Principles

1. **Test real code paths**.
2. **One behavior per test**.
3. **Assert observable outcomes** (state, callback, navigation, network call).
4. **Keep time deterministic** (`jest.setSystemTime` for date-sensitive UI).
5. **Avoid brittle snapshots for dynamic behavior**.
6. **Prefer explicit mocks over implicit side effects**.
7. **Add regression tests for every shipped bug fix**.

## Suite Structure

- `useNotifications.test.ts`
  - Permission flow
  - Token registration flow
  - Backend error handling
- `deepLinking.test.tsx`
  - Real `app/_layout.tsx` notification listener behavior
- `integration.test.tsx`
  - Assistant screen route param -> WebSocket connect behavior
- `phase6Regression.test.ts`
  - WebSocket handshake, retries, event routing, audio payload handling
- `generative/DayView.test.tsx`
  - Display modes, limits, fallback behavior with deterministic time
- `startPreferences.regression.test.tsx`
  - Start screen auth/bootstrap routing behavior
- `generative/integration.test.tsx`
  - WebSocket `generative_ui` event -> UI render replacement flow

## Shared Harness

This repo currently keeps mocks local to each test file (no global Jest setup).
If multiple files repeat the same mock setup, create a shared helper in this folder and import it explicitly.

## How To Create a New Test (Step-by-Step)

1. Identify one concrete behavior in production code.
2. Locate the code seam:
   - hook seam (`renderHook`)
   - component seam (`render`)
   - integration seam (component + hook + event)
3. Mock only external boundaries:
   - network
   - native modules
   - auth/session providers
4. Trigger the behavior:
   - press
   - callback
   - event
   - hook method call
5. Assert final output:
   - state fields
   - function calls with payload
   - navigation target
   - rendered text
6. Add at least one failure-path assertion.

Template:

```ts
it('does X when Y', async () => {
  // Arrange
  // Act
  // Assert
});
```

## How To Update Tests When Features Change

When behavior changes, follow this order:

1. Update failing tests to reflect the **new intended behavior**.
2. Add one regression test for the old bug/risk.
3. Remove obsolete tests that no longer represent product truth.
4. Re-run full suite and coverage.
5. Update docs in this folder if architecture/testing strategy changed.

## Anti-Patterns (Do Not Do)

1. Re-implementing app logic inside tests.
2. Testing only mocks calling other mocks.
3. Using real wall-clock dates that become stale.
4. Asserting internal implementation details with no user impact.
5. Writing only happy paths for stateful/networked hooks.

## Commands

Run all tests once:

```bash
npm run ci:test -- --watchAll=false
```

Run with coverage:

```bash
npm run ci:test -- --watchAll=false --coverage
```

Run a single file:

```bash
npm run ci:test -- --watchAll=false __tests__/phase6Regression.test.ts
```

## Coverage Gates

Coverage is collected for critical runtime paths:

- `app/_layout.tsx`
- `app/(start)/index.tsx`
- `components/generative/DayView.tsx`
- `hooks/useNotifications.ts`
- `hooks/useWebSocketAgent.ts`

Recommended quality floor (documented, not enforced in `package.json`):

- branches: `>=85%`
- functions: `>=92%`
- lines: `>=94%`
- statements: `>=94%`

## Definition of Done for Test Changes

1. New behavior has at least one happy path and one failure path test.
2. Any bug fix has a regression test.
3. Tests are deterministic (time/network/native behavior controlled).
4. Full suite and coverage pass locally.
5. This README is still accurate.
