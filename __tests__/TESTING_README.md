# Frontend Testing Quick Guide

Use `/Users/srujanu/Desktop/intentive/frontend/__tests__/README.md` as the source of truth.

## Daily Command

```bash
cd frontend
npm run ci:test -- --watchAll=false
```

## Current Baseline (February 7, 2026)

- 8 suites
- 42 tests
- all passing

## Integration Command

```bash
cd frontend
npm run ci:test -- --watchAll=false __tests__/integration.test.ts __tests__/generative/integration.test.tsx
```
