# Proposal

## Why

The internal OpenAPI of the AI assistants (`meet-ce/backend/openapi/ai-assistants/`) disagrees with what the server does and with the `live-captions` spec: `createAiAssistant` says "AI Assistand", `cancelAiAssistant` describes `assistantId` as the activation to cancel while the server stops the room's current assistant whatever id the path carries (`live-captions` "The assistant stops with its last user"), and both `409` examples show messages the server never sends (double quotes where the server uses single quotes, and the start message lacks the server's exact wording). The two `409` descriptions also use an em dash, which the project style forbids.

## What Changes

- Fix the "Assistand" typo in the `createAiAssistant` description.
- Describe `assistantId` of `cancelAiAssistant` as informative only: the caller stops using the room's current captions assistant, whatever the id.
- Make the `409` examples of both operations match the server's messages, and describe the `cancelAiAssistant` `409` as a start or stop of the room's assistant still in progress after the retry window; remove the em dashes.
- Remove the double space in the server's "already starting" message so the documented example and the response are identical.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Documentation only: the OpenAPI is brought in line with the `live-captions` spec, which already states the behavior.

## Impact

- Internal REST API documentation (`createAiAssistant`, `cancelAiAssistant`). No behavior change, no contract change; the error message loses a stray space.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- openvidu.io: none (the internal API reference is not published).
