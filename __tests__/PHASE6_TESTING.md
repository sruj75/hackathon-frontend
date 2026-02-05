# Phase 6: Frontend Integration - Testing Guide

## Overview

This document provides guidance for end-to-end testing of the Phase 6 implementation, which includes:
1. WebSocket init handshake with session resumption
2. Generative UI component rendering

## Automated Tests

✅ **All 49 automated tests passing:**
- DayView component tests (15 tests)
- TodoList component tests (16 tests)
- CalendarView component tests (16 tests)
- Integration tests (8 tests)

Run tests with:
```bash
cd frontend
npm test -- --testPathPattern=generative --watchAll=false
```

## Manual End-to-End Testing

### Test 1: Session Resumption from Notification

**Prerequisites:**
- Backend running: `cd agent && python main.py`
- Frontend running: `cd frontend && npx expo start`
- Push notifications configured

**Steps:**
1. Open app and complete a conversation with the agent
2. Close app (don't terminate)
3. Backend sends a notification with session data:
   ```json
   {
     "session_id": "session_user_default_2026-02-05",
     "type": "checkin"
   }
   ```
4. Tap notification
5. App should open with assistant screen
6. Check logs for init handshake:
   - Frontend: `[WS-INIT] Sending init handshake: { resume_session_id: ..., trigger_type: ... }`
   - Backend: `[WS-INIT] Received init handshake - resume_session_id: ..., trigger_type: ...`
7. Agent should continue previous conversation context

**Expected Results:**
- ✅ App navigates to `/assistant` with query params
- ✅ WebSocket sends init message with session_id and trigger_type
- ✅ Backend logs show init message received
- ✅ Session state restored from database
- ✅ Agent has access to previous conversation history
- ✅ trigger_type stored in session.state

### Test 2: Fresh Session (No Notification)

**Steps:**
1. Open app directly (not from notification)
2. Navigate to assistant screen
3. Check logs

**Expected Results:**
- ✅ WebSocket connects without sending init message
- ✅ New session created with daily session ID
- ✅ Agent greets user appropriately

### Test 3: Generative UI Rendering - DayView

**Steps:**
1. Connect to agent
2. Ask: "Show me my schedule for today"
3. Agent should call generative_ui tool with day_view component

**Expected Results:**
- ✅ Backend logs: `[MAIN-UI] >>> Detected ui_payload: component=day_view`
- ✅ Frontend logs: `[FRONTEND-WS] >>> Received generative_ui event: day_view`
- ✅ Agent visualization collapses to top
- ✅ DayView component renders in middle
- ✅ Shows scheduled events with time ranges
- ✅ Shows pending tasks section
- ✅ Shows completed tasks section

### Test 4: Generative UI Rendering - TodoList

**Steps:**
1. Ask agent: "Show me my tasks"
2. Agent should render todo_list component

**Expected Results:**
- ✅ TodoList component renders
- ✅ Pending tasks shown with count
- ✅ Completed tasks shown separately
- ✅ Scroll works for long lists

### Test 5: Generative UI Rendering - CalendarView

**Steps:**
1. Ask agent: "What's on my calendar?"
2. Agent should render calendar_view component

**Expected Results:**
- ✅ CalendarView component renders
- ✅ Events shown with time ranges
- ✅ Event descriptions displayed (if present)
- ✅ Time formatting correct (AM/PM)

### Test 6: Multiple UI Updates

**Steps:**
1. Ask for day view: "Show my day"
2. Then ask for calendar: "Show calendar"
3. Then ask for tasks: "Show tasks"

**Expected Results:**
- ✅ Each new UI component replaces previous one
- ✅ Smooth transitions between views
- ✅ No memory leaks or rendering issues

### Test 7: Session Persistence Across Backend Restart

**Steps:**
1. Start conversation with agent
2. Complete 3-4 turns
3. Note session_id from logs
4. Restart backend (kill and restart)
5. User opens app again with same session_id

**Expected Results:**
- ✅ Session loaded from database
- ✅ Conversation context intact
- ✅ Agent remembers previous turns
- ✅ No duplicate "Good morning" greeting

## Debugging Tips

### Check WebSocket Connection
```javascript
// In browser/React Native debugger console:
// Should see WebSocket connection established
```

### Check Backend Logs
```bash
# Watch for these log patterns:
# [WS-INIT] Received init handshake
# [WS-INIT] Stored trigger_type in session
# [MAIN-UI] >>> Detected ui_payload
# [MAIN-UI] <<< SENT generative_ui WebSocket event
```

### Check Frontend Logs
```javascript
// Look for these patterns in Expo logs:
// [WS-INIT] Sending init handshake
// [FRONTEND-WS] >>> Received generative_ui event
// [FRONTEND-RENDER] >>> Rendering component
```

## Common Issues

### Issue: Init message not received
**Solution:** Check that frontend is sending init immediately after WebSocket opens

### Issue: Session not resuming
**Solution:** Verify session_id format matches: `session_{user_id}_{YYYY-MM-DD}`

### Issue: UI component not rendering
**Solution:** Check that backend is sending correct component type and props structure

### Issue: WebSocket connection fails
**Solution:** Verify EXPO_PUBLIC_BACKEND_URL is set correctly in .env

## Performance Benchmarks

Expected performance metrics:
- WebSocket connection: < 500ms
- Init handshake: < 100ms
- Session load from DB: < 200ms
- UI component render: < 100ms
- Total time from notification tap to agent response: < 1s

## Security Considerations

- Session IDs are deterministic but scoped to user and date
- No sensitive data in init message (session_id and trigger_type only)
- Backend validates session ownership before loading
- WebSocket connection uses same auth as HTTP endpoints

## Next Steps

After completing manual testing:
1. Document any issues found
2. Update task.md with test results
3. Proceed to Phase 7: Verification & Ship
