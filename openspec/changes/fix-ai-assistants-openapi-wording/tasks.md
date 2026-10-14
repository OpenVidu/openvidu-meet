# Tasks

## 1. OpenAPI wording

- [ ] 1.1 In `meet-ce/backend/openapi/ai-assistants/ai-assistants.yaml`, fix "Assistand" in the `createAiAssistant` description and rewrite the `assistantId` parameter description of `cancelAiAssistant`: the room's current captions assistant is the one acted on, whatever the id; verify with `pnpm run lint:api`.
- [ ] 1.2 In `responses/errors/ai-assistant-starting.yaml` and `ai-assistant-cannot-be-stopped.yaml`, replace the em dashes, describe the `409` as another start or stop of the room's assistant still in progress after the retry window, and make the examples the exact messages of `errorAiAssistantAlreadyStarting` and `errorAiAssistantCannotBeStopped` (single quotes around the room id); verify with `pnpm run lint:api`.
- [ ] 1.3 Remove the double space in the message of `errorAiAssistantAlreadyStarting` (`meet-ce/backend/src/models/error.model.ts`) and check that no test asserts the old text (`meet-ce/backend/tests/integration/api/meetings/ai-assistant.test.ts`).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no line. Documentation-only change to the internal API.
- [ ] 2.2 openvidu.io: none.
