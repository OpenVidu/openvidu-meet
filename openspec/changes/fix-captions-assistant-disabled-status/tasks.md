# Tasks

## 1. Captions off answers 403

- [x] 1.1 Replace the `500` configuration errors of the captions start checks with a `403` error per switch (deployment, room), in the style of the existing `errorHandDisabled`/`errorReactionsDisabled`; verify with cases in `meet-ce/backend/tests/integration/api/meetings/ai-assistant.test.ts` for both switches expecting `403` and no agent dispatch; report them as not run if the local deployment is unavailable.
- [x] 1.2 Document the `403` of `createAiAssistant` in `meet-ce/backend/openapi/ai-assistants/ai-assistants.yaml` with a response that names both causes (captions disabled for the deployment or for the room); verify with `pnpm run lint:api`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line. `createAiAssistant` belongs to the internal API, which host applications do not build against, and the meeting UI behaves the same.
- [x] 2.2 openvidu.io: none.
