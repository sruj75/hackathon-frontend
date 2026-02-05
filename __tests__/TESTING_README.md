# Frontend Testing Guide

This document provides instructions for running and understanding the frontend test suite.

## Overview

The frontend test suite covers:
- **Push notifications**: Token registration, permission handling
- **Deep linking**: Notification tap handling, session resumption
- **WebSocket integration**: Agent connection, message handling
- **Integration**: Complete frontend-backend flows

---

## Quick Start

```bash
# Install dependencies (if not already done)
npm install

# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

---

## Test Files

```
frontend/__tests__/
├── README.md                    # This file
├── useNotifications.test.ts     # Push notification hook tests
├── deepLinking.test.ts          # Notification tap handling tests
├── useWebSocketAgent.test.ts    # WebSocket connection tests
└── integration.test.ts          # Frontend-backend integration tests
```

---

## Running Specific Tests

```bash
# Run specific test file
npm test -- useNotifications.test.ts

# Run test matching pattern
npm test -- --testNamePattern="should request permissions"

# Run tests in specific directory
npm test -- __tests__/deepLinking.test.ts
```

---

## Test Coverage

### Generate Coverage Report

```bash
npm test -- --coverage
```

This will generate:
- Console summary
- HTML report in `coverage/lcov-report/index.html`

### Open Coverage Report

```bash
# macOS
open coverage/lcov-report/index.html

# Linux
xdg-open coverage/lcov-report/index.html

# Windows
start coverage/lcov-report/index.html
```

---

## Test Suites

### 1. useNotifications Tests

**File**: `useNotifications.test.ts`

**What it tests:**
- Permission request flow
- Token retrieval from Expo
- Token POST to backend
- Graceful failure handling
- Simulator detection

**Run:**
```bash
npm test -- useNotifications.test.ts
```

### 2. Deep Linking Tests

**File**: `deepLinking.test.ts`

**What it tests:**
- Notification tap opens assistant screen
- Session ID extraction from notification data
- Deep linking when app is killed/background
- Handling multiple notifications
- Malformed notification data handling

**Run:**
```bash
npm test -- deepLinking.test.ts
```

### 3. WebSocket Agent Tests

**File**: `useWebSocketAgent.test.ts`

**What it tests:**
- Connection with resume_session_id
- Connection without session_id (fresh session)
- Reconnection with session preservation
- Message sending/receiving
- Error handling

**Run:**
```bash
npm test -- useWebSocketAgent.test.ts
```

### 4. Integration Tests

**File**: `integration.test.ts`

**What it tests:**
- Complete notification flow (permissions → token → notification → tap → session)
- Token registration on app launch
- Permission denial handling
- Backend communication errors
- Simulator vs device behavior

**Run:**
```bash
npm test -- integration.test.ts
```

---

## Interpreting Results

### Successful Test Run

```
PASS  __tests__/useNotifications.test.ts
  useNotifications
    ✓ should request permissions on mount (45 ms)
    ✓ should get push token and POST to backend (32 ms)
    ✓ should handle permission denial gracefully (28 ms)

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        2.456 s
```

### Failed Test Example

```
FAIL  __tests__/deepLinking.test.ts
  ● Deep Linking › should navigate to assistant when notification tapped

    expect(jest.fn()).toHaveBeenCalledWith('/assistant')

    Expected: "/assistant"
    Received: undefined

    Number of calls: 0
```

**How to debug:**
1. Check the test expectations
2. Verify mock setup
3. Review implementation code
4. Add console.logs if needed
5. Fix and re-run

---

## Common Issues

### Issue: Module Not Found

```
Cannot find module 'expo-notifications'
```

**Solution:**
```bash
npm install expo-notifications expo-device
npm install --save-dev @testing-library/react-native
```

### Issue: Mock Not Working

```
TypeError: Cannot read property 'getPermissionsAsync' of undefined
```

**Solution:**
Ensure mocks are set up before importing:
```typescript
jest.mock('expo-notifications');
import * as Notifications from 'expo-notifications';
```

### Issue: Async Tests Timeout

```
Timeout - Async callback was not invoked within the 5000 ms timeout
```

**Solution:**
Use `waitFor` and increase timeout if needed:
```typescript
await waitFor(() => {
  expect(result.current.isReady).toBe(true);
}, { timeout: 10000 });
```

---

## Writing New Tests

### Example Test Structure

```typescript
import { renderHook, waitFor } from '@testing-library/react-native';

describe('My Feature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should do something', async () => {
    // Arrange
    const mockData = { test: 'data' };
    
    // Act
    const { result } = renderHook(() => useMyHook());
    
    // Assert
    await waitFor(() => {
      expect(result.current.value).toBe(mockData);
    });
  });
});
```

### Best Practices

1. **Clear mocks before each test**
   ```typescript
   beforeEach(() => {
     jest.clearAllMocks();
   });
   ```

2. **Use descriptive test names**
   ```typescript
   test('should handle permission denial gracefully', async () => {
     // ...
   });
   ```

3. **Test both success and error paths**
   ```typescript
   test('should succeed with valid data', async () => {});
   test('should fail gracefully with invalid data', async () => {});
   ```

4. **Mock external dependencies**
   ```typescript
   jest.mock('expo-notifications');
   jest.mock('expo-device');
   global.fetch = jest.fn();
   ```

5. **Use waitFor for async operations**
   ```typescript
   await waitFor(() => {
     expect(result.current.isReady).toBe(true);
   });
   ```

---

## Continuous Integration

### Example GitHub Actions

```yaml
name: Frontend Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd frontend
          npm install
      - name: Run tests
        run: |
          cd frontend
          npm test -- --coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          directory: ./frontend/coverage
```

---

## Performance

### Expected Test Times

- **Individual test**: < 100ms
- **Test file**: < 5 seconds
- **All tests**: < 30 seconds

If tests are slower:
- Check for unnecessary async operations
- Verify mocks are properly set up
- Reduce test complexity

---

## FAQs

### Q: Do I need a physical device to run tests?

**A:** No. All tests use mocked Expo modules and can run on any machine.

### Q: Can I test push notifications without Expo?

**A:** Yes. Tests mock the Expo API, so no actual push notifications are sent.

### Q: How do I test real WebSocket connections?

**A:** Integration tests mock WebSocket. For real testing, use manual/E2E tests with a running backend.

### Q: What if I get TypeScript errors?

**A:** Ensure `@types/jest` is installed and tsconfig includes test files.

---

## Next Steps

After running tests successfully:

1. Review coverage report
2. Add tests for new features
3. Fix any failing tests
4. Set up CI/CD
5. Document test patterns for your team

---

## Summary

✅ **All critical frontend functionality is tested:**
- Push notification registration and setup
- Deep linking from notifications with session context
- WebSocket connections with and without session resumption
- Frontend-backend integration for token registration
- Error handling and edge cases (e.g., simulator detection, permission denial)

---

## Technical Details

- **Framework**: Jest with React Native Testing Library
- **Mocks**: 
  - `expo-notifications` and `expo-device` are mocked to simulate device environments.
  - `WebSocket` is mocked globally to verify connection URL construction and event listeners.
  - `expo-router` is mocked to verify navigation calls.
  - `fetch` is mocked for backend communication tests.

**Run tests regularly to catch bugs early!**
