# OpenVidu Meet Backend - Test Suite Documentation

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Test Coverage](#test-coverage)
4. [Test Types](#test-types)
5. [Test Files Structure](#test-files-structure)
6. [Running Tests](#running-tests)

---

## Overview

This document provides a comprehensive overview of the test suite for the OpenVidu Meet Backend, a Node.js/Express application. The test suite includes both integration and unit tests designed to ensure the reliability and correctness of the REST API, business logic, and internal services.

The test suite covers **51 test files** containing **517 test cases**, organized into integration tests (49 files, 503 test cases) and unit tests (2 files, 14 test cases).

---

## Technology Stack

The test suite uses the following technologies:

- **Testing Framework**: Jest 29.7.0
- **Test Runner**: Node.js with experimental VM modules support
- **HTTP Testing**: Supertest 7.1.3 (for API endpoint testing)
- **TypeScript Support**: ts-jest 29.4.0 with ESM support
- **Type Definitions**: @types/jest 29.5.14, @types/supertest 6.0.3
- **Test Reporting**: jest-junit 16.0.0 (CI/CD integration)
- **Additional Tools**:
  - jest-fetch-mock 3.0.3 (HTTP request mocking)
  - unzipper 0.12.3 (testing file compression features)

### Jest Configuration

- **Module Resolution**: ESNext with Node16 resolution
- **Test Environment**: Node.js
- **Test Timeout**: 60 seconds (to accommodate integration tests with real services)
- **Execution Mode**: Sequential (`--runInBand`) for integration tests to avoid conflicts
- **Extensions**: `.ts`, `.js`, `.json`, `.node`
- **ESM Support**: Full ES Module support with experimental VM modules

---

## Test Coverage

### Coverage by Feature Area

The test suite provides comprehensive coverage across all major features:

| Feature Area | Test Files | Test Cases | Coverage Description |
|-------------|-----------|------------|---------------------|
| **Rooms** | 14 | 150 | Room CRUD operations, configuration, member token generation, status management, deletion policies, garbage collection |
| **Security** | 8 | 146 | Authentication, authorization, API key security, role-based access control across all endpoints |
| **Recordings** | 12 | 119 | Recording lifecycle, media management, access control, bulk operations, garbage collection, race conditions |
| **Global Config** | 3 | 33 | Appearance, security, and webhook configuration management |
| **Meetings** | 4 | 27 | Meeting lifecycle, participant management, kick operations, name services |
| **Auth** | 3 | 10 | Login, logout, token refresh mechanisms |
| **Analytics** | 1 | 5 | System analytics and metrics collection |
| **Webhooks** | 1 | 5 | Webhook event delivery and configuration |
| **API Keys** | 3 | 4 | API key creation, retrieval, and deletion |
| **Users** | 2 | 4 | User profile and password management |
| **Unit Tests** | 2 | 14 | Path utilities and type validations |

### Total Coverage

- **Total Test Files**: 51
- **Total Test Cases**: 517
- **Integration Tests**: 49 files / 503 test cases
- **Unit Tests**: 2 files / 14 test cases

---

## Test Types

### 1. Integration Tests (503 test cases)

Integration tests verify the complete behavior of the application by testing API endpoints with real dependencies where possible. These tests simulate actual HTTP requests and validate responses.

#### Key Characteristics:
- Real Express application initialization
- Real database connections (MongoDB)
- Real Redis connections for distributed locks
- LiveKit SDK integration
- HTTP request/response validation
- End-to-end workflow testing

#### Test Categories:

##### **API Endpoint Tests**
Test REST API endpoints for correct behavior, including:
- Request validation (input schemas, data types)
- Response structure and status codes
- Business logic execution
- Error handling and edge cases

##### **Security Tests**
Comprehensive security validation across all endpoints:
- Authentication requirements (API keys, JWT tokens)
- Authorization and role-based access control
- Permission validation for different user roles
- Unauthorized access prevention
- Token expiration and refresh

##### **Garbage Collection Tests**
Automated cleanup and maintenance operations:
- Expired room deletion
- Active status room cleanup
- Stale recording garbage collection
- Orphaned lock cleanup
- Recording lock timeout handling

##### **Race Condition Tests**
Concurrent operation handling:
- Simultaneous recording start/stop operations
- Multiple participant actions
- Lock acquisition and release under load
- Distributed system consistency

##### **Webhook Tests**
Event notification system validation:
- Webhook delivery on various events
- Configuration management
- Error handling for unreachable endpoints
- Event payload validation

### 2. Unit Tests (14 test cases)

Unit tests validate individual functions and utilities in isolation.

#### Coverage:

##### **Path Utilities (`path.utils.spec.ts`)**
- Project path resolution across different execution contexts
- Directory structure validation
- File path construction
- Robustness across different working directories

##### **Type Validations (`typings/livekit-video-grants.test.ts`)**
- LiveKit video grant type definitions
- Type safety validations
- Schema compliance

---

## Test Files Structure

```
tests/
├── README.md                          # This documentation
├── helpers/                           # Shared test utilities
│   ├── assertion-helpers.ts           # Custom Jest matchers and assertions
│   ├── event-controller.ts            # Event handling for distributed tests
│   ├── request-helpers.ts             # HTTP request builders and utilities
│   └── test-scenarios.ts              # Reusable test setup scenarios
├── interfaces/
│   └── scenarios.ts                   # TypeScript interfaces for test data
├── integration/                       # Integration tests (49 files)
│   ├── api/
│   │   ├── analytics/                 # Analytics API tests (1 file, 5 tests)
│   │   │   └── get-analytics.test.ts
│   │   ├── api-keys/                  # API key management (3 files, 4 tests)
│   │   │   ├── create-api-key.test.ts
│   │   │   ├── delete-api-keys.test.ts
│   │   │   └── get-api-keys.test.ts
│   │   ├── auth/                      # Authentication (3 files, 10 tests)
│   │   │   ├── login.test.ts
│   │   │   ├── logout.test.ts
│   │   │   └── refresh-token.test.ts
│   │   ├── global-config/             # Global configuration (3 files, 33 tests)
│   │   │   ├── appearance.test.ts
│   │   │   ├── security.test.ts
│   │   │   └── webhook.test.ts
│   │   ├── meetings/                  # Meeting management (4 files, 27 tests)
│   │   │   ├── end-meeting.test.ts
│   │   │   ├── kick-participant.test.ts
│   │   │   ├── participant-name.service.test.ts
│   │   │   └── update-participant.test.ts
│   │   ├── recordings/                # Recording operations (12 files, 119 tests)
│   │   │   ├── bulk-delete-recording.test.ts
│   │   │   ├── delete-recording.test.ts
│   │   │   ├── download-recordings.test.ts
│   │   │   ├── get-media-recording.test.ts
│   │   │   ├── get-recording-url.test.ts
│   │   │   ├── get-recording.test.ts
│   │   │   ├── get-recordings.test.ts
│   │   │   ├── orphaned-locks-gc.test.ts
│   │   │   ├── race-conditions.test.ts
│   │   │   ├── stale-recordings-gc.test.ts
│   │   │   ├── start-recording.test.ts
│   │   │   └── stop-recording.test.ts
│   │   ├── rooms/                     # Room management (14 files, 150 tests)
│   │   │   ├── active-status-rooms-gc.test.ts
│   │   │   ├── bulk-delete-rooms.test.ts
│   │   │   ├── create-room.test.ts
│   │   │   ├── delete-room.test.ts
│   │   │   ├── e2ee-room-config.test.ts
│   │   │   ├── expired-rooms-gc.test.ts
│   │   │   ├── generate-room-member-token.test.ts
│   │   │   ├── get-room-config.test.ts
│   │   │   ├── get-room-member-roles.test.ts
│   │   │   ├── get-room.test.ts
│   │   │   ├── get-rooms.test.ts
│   │   │   ├── update-room-config.test.ts
│   │   │   └── update-room-status.test.ts
│   │   ├── security/                  # Security tests (8 files, 146 tests)
│   │   │   ├── analytics-security.test.ts
│   │   │   ├── api-key-security.test.ts
│   │   │   ├── global-config-security.test.ts
│   │   │   ├── meeting-security.test.ts
│   │   │   ├── recording-security.test.ts
│   │   │   ├── room-security.test.ts
│   │   │   └── user-security.test.ts
│   │   └── users/                     # User management (2 files, 4 tests)
│   │       ├── change-password.test.ts
│   │       └── get-profile.test.ts
│   └── webhooks/                      # Webhook integration (1 file, 5 tests)
│       └── webhook.test.ts
└── unit/                              # Unit tests (2 files, 14 tests)
    ├── path.utils.spec.ts
    └── typings/
        └── livekit-video-grants.test.ts
```

### Helper Utilities

#### `request-helpers.ts`
Provides reusable functions for:
- Server initialization and cleanup
- Authentication (login, token generation)
- Room creation and management
- Recording operations
- API key management
- Fake participant simulation
- Sleep and timing utilities

#### `assertion-helpers.ts`
Custom Jest matchers for:
- Room validation
- Recording validation
- Error response validation
- Token structure validation
- Configuration validation

#### `test-scenarios.ts`
Pre-configured test scenarios:
- Single room setup
- Multi-room setup
- Room with recording setup
- Webhook server simulation
- Complex participant scenarios

---

## Running Tests

### Available Test Scripts

The backend provides granular test execution scripts for different test suites:

#### Run All Tests
```bash
pnpm test:unit              # Run all unit tests
pnpm test:integration-rooms # Run all room-related integration tests
```

#### Specific Feature Tests
```bash
# Room and Meeting Management
pnpm test:integration-room-management     # Rooms + Meetings
pnpm test:integration-rooms               # Room tests only
pnpm test:integration-meetings            # Meeting tests only

# Security and Authentication
pnpm test:integration-auth-security       # Auth, Security, API Keys, Users
pnpm test:integration-security            # Security tests only
pnpm test:integration-auth                # Authentication tests only
pnpm test:integration-api-keys            # API key tests only
pnpm test:integration-users               # User tests only

# Configuration and Analytics
pnpm test:integration-config-analytics    # Config + Analytics
pnpm test:integration-global-config       # Global config tests only
pnpm test:integration-analytics           # Analytics tests only

# Recordings and Webhooks
pnpm test:integration-recordings          # All recording tests
pnpm test:integration-webhooks            # Webhook integration tests
```

### Test Execution Configuration

All test scripts use the following Jest configuration:
- `--runInBand`: Sequential execution (prevents race conditions)
- `--forceExit`: Forces exit after tests complete
- `--ci`: CI mode (optimizes for continuous integration)
- `--reporters=default --reporters=jest-junit`: Dual reporting (console + XML)

#### Recording Tests Special Configuration
```bash
pnpm test:integration-recordings
```
Uses `--maxWorkers=1 --maxConcurrency=1` for strict sequential execution due to recording service limitations.

### Test Output

- **Console**: Real-time test results with Jest's default reporter
- **JUnit XML**: `test-results/junit.xml` (for CI/CD integration)

### Environment Requirements

Tests require the following services to be running:
- **MongoDB**: Database for room and recording data
- **Redis**: Distributed locking and caching
- **LiveKit Server**: WebRTC media server (for full integration tests)

Environment variables are configured via:
- `.env` file (development)
- CI/CD environment variables (production)

### Test Isolation

- Each test suite cleans up created resources in `afterAll` hooks
- Tests use unique identifiers to prevent conflicts
- Sequential execution prevents race conditions
- Database and Redis are reset between test runs when needed

