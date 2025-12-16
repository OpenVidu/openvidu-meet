# OpenVidu Meet Web Component - Test Suite Documentation

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Test Coverage](#test-coverage)
4. [Test Types](#test-types)
5. [Test Files Structure](#test-files-structure)
6. [Running Tests](#running-tests)

---

## Overview

This document provides a comprehensive overview of the test suite for the OpenVidu Meet Web Component, a reusable custom HTML element that embeds the full OpenVidu Meet application in any web page. The test suite includes both end-to-end (E2E) and unit tests to ensure the reliability and correctness of the web component's functionality, attributes, commands, and events.

The test suite covers **12 test files** containing **121 test cases**, organized into E2E tests (8 files, 74 test cases) and unit tests (4 files, 47 test cases).

---

## Technology Stack

The test suite uses the following technologies:

### End-to-End Testing
- **Testing Framework**: Playwright 1.53.2
- **Browser Automation**: Multi-browser support (Chromium, Firefox, WebKit)
- **Visual Testing**:
  - pixelmatch 7.1.0 (pixel-level image comparison)
  - pngjs 7.0.0 (PNG image processing)
- **Test Runner**: Playwright Test Runner
- **TypeScript Support**: ts-node 10.9.2, typescript 5.7.3

### Unit Testing
- **Testing Framework**: Jest 29.7.0
- **Test Environment**: jsdom (DOM simulation)
- **TypeScript Support**: ts-jest 29.2.5 with ESM support
- **Module Mocking**: identity-obj-proxy 3.0.0 (CSS module mocking)
- **Type Definitions**: @types/jest 29.5.14

### Playwright Configuration

- **Test Directory**: `./tests/e2e`
- **Timeout**: 60 seconds per test
- **Retries**: 0 (no automatic retries)
- **Workers**: 1 (sequential execution)
- **Parallel Execution**: Disabled
- **Headless Mode**: CI-dependent (headless in CI, headed in development)
- **Viewport**: 1280x720
- **Permissions**: Camera and microphone access enabled
- **Video Recording**: On failure only
- **Browser Arguments**:
  - Fake media devices for camera/microphone
  - File access from local files
  - Sandbox disabled for CI compatibility

### Jest Configuration

- **Test Environment**: jsdom (browser-like environment)
- **Module Resolution**: ESM with ts-jest
- **Extensions**: `.ts`, `.js`, `.json`, `.node`
- **Excluded Paths**: `/node_modules/`, `/dist/`, `/tests/e2e/`
- **CSS Mocking**: Style imports mocked for unit tests

---

## Test Coverage

### Coverage by Feature Area

The test suite provides comprehensive coverage across all major web component features:

| Feature Area | Test Files | Test Cases | Coverage Description |
|-------------|-----------|------------|---------------------|
| **E2E - Room** | 1 | 9 | Component rendering, toolbar, media controls, screen sharing, virtual backgrounds, visual regression |
| **E2E - Events** | 1 | 16 | Event handling (joined, left, error, kicked), event payload validation, multi-participant scenarios |
| **E2E - Moderation** | 1 | 7 | Participant kicking, role changes, moderator permissions, permission enforcement |
| **E2E - Webhooks** | 1 | 2 | Webhook event delivery verification, meeting lifecycle webhooks |
| **E2E - UI Features** | 1 | 8 | Chat toggle, recordings toggle, virtual background toggle, feature configuration |
| **E2E - E2EE UI** | 1 | 7 | End-to-end encryption UI elements, key input, encrypted badge, room restrictions |
| **E2E - Recording Access** | 1 | 6 | Recording visibility, access control (admin/moderator/speaker), playback permissions |
| **E2E - Custom Layout** | 1 | 19 | Layout customization, branding, logo injection, theme colors, hide toolbar elements |
| **Unit - Attributes** | 1 | 24 | Web component attributes, iframe configuration, URL handling, token management |
| **Unit - Commands** | 1 | 11 | Command messaging system, origin validation, initialize/leave/mute commands |
| **Unit - Events** | 1 | 7 | Event subscription (on/once/off), event emission, custom event handling |
| **Unit - Lifecycle** | 1 | 5 | Component lifecycle, DOM connection/disconnection, error states, cleanup |

### Total Coverage

- **Total Test Files**: 12
- **Total Test Cases**: 121
- **E2E Tests**: 8 files / 74 test cases
- **Unit Tests**: 4 files / 47 test cases

---

## Test Types

### 1. End-to-End Tests (74 test cases)

E2E tests validate the complete web component behavior in a real browser environment, simulating actual user interactions and verifying visual outputs.

#### Key Characteristics:
- Real browser automation with Playwright
- Shadow DOM traversal and manipulation
- Real media device simulation (camera/microphone)
- Backend API integration testing
- Visual regression testing with screenshot comparison
- Multi-participant scenarios
- WebRTC functionality validation

#### Test Categories:

##### **Core Room Tests** (`e2e/core/room.test.ts` - 9 tests)
Component rendering and basic room functionality:
- Web component loading with shadow DOM and iframe
- Toolbar and media button visibility
- Camera/microphone toggle functionality
- Screen sharing start/stop operations
- Virtual background application and validation
- Visual regression testing with screenshot comparison
- Participant display and layout

##### **Core Event Tests** (`e2e/core/events.test.ts` - 16 tests)
Event system validation:
- JOINED event when entering room (moderator/speaker roles)
- LEFT event with voluntary leave reason
- LEFT event with kicked reason
- ERROR event on invalid room access
- Event payload structure and content validation
- Single event emission per action (no duplicates)
- Event handling with multiple participants
- Error handling for unauthorized access

##### **Core Moderation Tests** (`e2e/core/moderation.test.ts` - 7 tests)
Moderation capabilities:
- Participant kicking by moderators
- KICKED event reception by removed participants
- Participant role changes (speaker to moderator, moderator to speaker)
- Permission enforcement (speakers cannot kick)
- Multi-participant moderation scenarios
- Role-based access control validation

##### **Core Webhook Tests** (`e2e/core/webhooks.test.ts` - 2 tests)
Webhook event delivery:
- meeting_started webhook on room creation
- meeting_ended webhook on meeting closure
- Webhook payload validation

##### **UI Feature Configuration Tests** (`e2e/ui-feature-config.test.ts` - 8 tests)
Dynamic feature toggling:
- Chat panel visibility control (enabled/disabled)
- Recording controls visibility (enabled/disabled)
- Virtual background controls visibility (enabled/disabled)
- Active features status toggle (enabled/disabled)
- Feature configuration via room config API
- UI element hiding based on permissions

##### **E2EE UI Tests** (`e2e/e2ee-ui.test.ts` - 7 tests)
End-to-end encryption interface:
- E2EE badge display in lobby when enabled
- E2EE key input field presence and validation
- Encryption key requirement enforcement
- E2EE elements hidden when disabled
- Room status badge in session (encrypted/unencrypted)
- Encryption restrictions and warnings
- Key validation and error handling

##### **Recording Access Tests** (`e2e/recording-access.test.ts` - 6 tests)
Recording permission management:
- Recording button visibility for different roles
- Access control (admin only, admin+moderator, admin+moderator+speaker)
- Recording start/stop permissions
- Role-based recording feature display
- Permission enforcement across different user types

##### **Custom Layout Tests** (`e2e/custom-layout.test.ts` - 19 tests)
Appearance customization:
- Custom logo injection (URL and base64)
- Logo size and positioning
- Branding text customization
- Theme color customization (primary, secondary, background)
- Toolbar element hiding (chat, participants, activities, settings, leave)
- Multiple customization combinations
- CSS variable injection
- Default values when customization not provided

### 2. Unit Tests (47 test cases)

Unit tests validate individual web component features in isolation using jsdom.

#### Coverage:

##### **Attributes Tests** (`unit/attributes.test.ts` - 24 tests)
Web component HTML attributes:
- Iframe setup with correct media permissions
- Required attributes validation (`room-url` or `recording-url`)
- URL attribute handling and iframe src assignment
- Attribute priority (room-url over recording-url)
- Target origin extraction from URLs
- Tokens attribute parsing and forwarding
- Token types (room member token, recording token)
- Minimal attributes configuration
- Attribute change detection and iframe updates
- Invalid attribute handling

##### **Commands Tests** (`unit/commands.test.ts` - 11 tests)
Command messaging system:
- Target origin configuration
- Initialize command sending
- Event subscription (on/once/off)
- Event unsubscription
- Unsupported event filtering
- Leave room command
- Toggle camera command
- Toggle microphone command
- Command message structure and payload
- Cross-origin communication validation

##### **Events Tests** (`unit/events.test.ts` - 7 tests)
Event handling system:
- READY event handling
- Custom event dispatching
- Event payload forwarding
- Multi-event handling
- Origin validation for security
- Event bubbling and composition
- Target origin configuration

##### **Lifecycle Tests** (`unit/lifecycle.test.ts` - 5 tests)
Component lifecycle management:
- Component initialization
- DOM connection callback
- DOM disconnection callback
- Resource cleanup on removal
- Error state handling
- Load timeout management

---

## Test Files Structure

```
tests/
├── README.md                          # This documentation
├── config.ts                          # Test configuration (API URLs, credentials)
├── playwright.config.ts               # Playwright E2E configuration
├── __mocks__/
│   └── styleMock.js                   # CSS module mock for unit tests
├── assets/
│   └── audio/
│       └── generate-test-audio.sh     # Audio file generation for tests
├── e2e/                               # End-to-end tests (8 files, 74 tests)
│   ├── core/
│   │   ├── room.test.ts               # Room functionality (9 tests)
│   │   ├── events.test.ts             # Event handling (16 tests)
│   │   ├── moderation.test.ts         # Moderation features (7 tests)
│   │   └── webhooks.test.ts           # Webhook delivery (2 tests)
│   ├── ui-feature-config.test.ts      # UI feature toggling (8 tests)
│   ├── e2ee-ui.test.ts                # E2EE interface (7 tests)
│   ├── recording-access.test.ts       # Recording permissions (6 tests)
│   └── custom-layout.test.ts          # Layout customization (19 tests)
├── unit/                              # Unit tests (4 files, 47 tests)
│   ├── attributes.test.ts             # HTML attributes (24 tests)
│   ├── commands.test.ts               # Command system (11 tests)
│   ├── events.test.ts                 # Event system (7 tests)
│   └── lifecycle.test.ts              # Component lifecycle (5 tests)
├── helpers/
│   ├── function-helpers.ts            # E2E test utilities (750+ lines)
│   └── participant.helper.ts          # Participant management utilities
└── interfaces/
    └── fake-participant.ts            # TypeScript interfaces for test data
```

### Helper Utilities

#### `function-helpers.ts`
Comprehensive E2E test utilities:
- **Shadow DOM Navigation**: `getIframeInShadowDom()`, `waitForElementInIframe()`
- **Element Interaction**: `interactWithElementInIframe()`, `clickElementInIframe()`
- **Room Management**: `createTestRoom()`, `deleteAllRooms()`, `updateRoomConfig()`
- **Participant Actions**: `joinRoomAs()`, `leaveRoom()`, `prepareForJoiningRoom()`
- **Recording Operations**: `deleteAllRecordings()`, `waitForRecording()`
- **Media Controls**: `startScreenSharing()`, `stopScreenSharing()`, `applyVirtualBackground()`
- **Visual Testing**: `saveScreenshot()`, `compareScreenshots()`
- **UI Navigation**: `openMoreOptionsMenu()`, `closeMoreOptionsMenu()`
- **Element Counting**: `countElementsInIframe()`

#### `participant.helper.ts`
Multi-participant test scenarios:
- Fake participant management
- Concurrent user simulation
- Role-based participant creation

---

## Running Tests

### Available Test Scripts

The webcomponent provides granular test execution scripts:

#### Run All Tests
```bash
pnpm test:unit              # Run all unit tests
pnpm test:e2e               # Run all E2E tests
```

#### E2E Test Suites
```bash
# Core Functionality
pnpm test:e2e-core          # All core tests (room, events, moderation, webhooks)
pnpm test:e2e-core-room     # Room functionality only
pnpm test:e2e-core-events   # Event handling only
pnpm test:e2e-core-webhooks # Webhook tests only

# Feature-Specific
pnpm test:e2e-ui-features   # UI feature configuration tests
pnpm test:e2e-e2ee-ui       # E2EE interface tests
pnpm test:e2e-recording-access  # Recording access control tests
```

### Test Execution Configuration

#### Unit Tests (Jest)
- **Execution**: Sequential (`--forceExit`)
- **Pattern**: `tests/unit/**/*.test.ts`
- **Environment**: jsdom (browser simulation)
- **CI Mode**: Enabled (`--ci`)

#### E2E Tests (Playwright)
- **Workers**: 1 (sequential execution)
- **Retries**: 0 (no automatic retries)
- **Timeout**: 60 seconds per test
- **Headless**: Environment-dependent (CI vs development)
- **Video**: Recorded on failure only
- **Viewport**: 1280x720
- **Browsers**: Chromium (default), Firefox, WebKit (configurable)

### Environment Configuration

Tests require the following configuration (defined in `tests/config.ts`):

```typescript
MEET_API_URL       # Backend API URL (default: http://localhost:6080)
MEET_API_KEY       # API key for backend (default: meet-api-key)
MEET_TESTAPP_URL   # Test application URL (default: http://localhost:5080)
RUN_MODE           # Execution mode: 'CI' or 'development'
```

### Environment Requirements

E2E tests require the following services:
- **Backend API**: OpenVidu Meet backend running
- **Test Application**: Test harness application running
- **MongoDB**: Database for room/recording data
- **Redis**: Distributed locking
- **LiveKit Server**: WebRTC media server

Unit tests run in isolation and don't require external services.

### Test Output

#### Unit Tests
- **Console**: Jest default reporter with test results
- **Format**: Pass/fail status with execution time
- **Coverage**: Can be enabled with `--coverage` flag

#### E2E Tests
- **Console**: Playwright test reporter with test status
- **Videos**: Saved in `test-results/` on failure
- **Screenshots**: Captured and stored for failed tests
- **HTML Report**: Generated with `playwright show-report`

### Test Isolation and Cleanup

- **beforeAll**: Creates test room for suite
- **beforeEach**: Generates unique participant names
- **afterEach**: Saves browser storage state
- **afterAll**: Cleans up rooms and recordings
- **Sequential Execution**: Prevents race conditions
- **Unique Identifiers**: Each test uses unique participant names

