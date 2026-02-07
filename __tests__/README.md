# Frontend Tests

Last validated: **February 7, 2026**  
Status: **8 suites, 42 tests passing**

## Run

```bash
cd frontend
npm run ci:test -- --watchAll=false
```

## Integration Only

```bash
cd frontend
npm run ci:test -- --watchAll=false __tests__/integration.test.ts __tests__/generative/integration.test.tsx
```

## Active Test Files

- `__tests__/useNotifications.test.ts` - push permission + token registration
- `__tests__/deepLinking.test.ts` - notification tap routing/session params
- `__tests__/integration.test.ts` - frontend notification flow integration
- `__tests__/phase6Regression.test.ts` - phase 6 WebSocket init + generative UI routing
- `__tests__/generative/DayView.test.tsx` - enhanced day view with contextual intelligence
- `__tests__/generative/integration.test.tsx` - generative_ui event-to-render flow

## Scope Rule

Keep tests focused on current behavior only:
- one happy path
- one failure/edge path
- one regression guard per feature
