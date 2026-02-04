# Frontend Tests

Unit tests for the Intentive frontend (React Native / Expo).

## Running Tests

Run all tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm test -- --watch
```

Run specific test file:

```bash
npm test -- useNotifications.test.ts
```

Run with coverage:

```bash
npm test -- --coverage
```

## Test Structure

### useNotifications.test.ts

Tests for push notification hook:

- ✅ Permission request flow
- ✅ Token POST to backend
- ✅ Graceful failure handling (denied permissions, network errors)
- ✅ Simulator detection
- ✅ Backend URL validation

## Writing New Tests

Use React Native Testing Library patterns:

```typescript
import { renderHook, waitFor } from '@testing-library/react-native';

test('should do something', async () => {
  const { result } = renderHook(() => useMyHook());
  
  await waitFor(() => {
    expect(result.current.isReady).toBe(true);
  });
  
  expect(result.current.value).toBe('expected');
});
```

## Mocking

Mock Expo modules in your test:

```typescript
jest.mock('expo-notifications');
jest.mock('expo-device');
```

Mock fetch globally:

```typescript
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: 'result' })
});
```
