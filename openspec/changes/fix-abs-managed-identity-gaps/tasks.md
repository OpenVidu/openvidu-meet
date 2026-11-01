# Tasks

## 1. Choose the identity

- [ ] 1.1 In the constructor of `meet-ce/backend/src/services/storage/providers/abs/abs.service.ts`, build `ManagedIdentityCredential` with `{ clientId }` when `AZURE_CLIENT_ID` is set. Verify in `meet-ce/backend/tests/unit/services/blob-storage.service.test.ts` (or the existing ABS unit test) with a mocked `@azure/identity` that asserts the options passed.

## 2. Follow-ups outside this repository

- [ ] 2.1 Record, without implementing here: `openvidu-deployment` installers accept an empty `MEET_AZURE_ACCOUNT_KEY` for Meet (today `:?mandatory`), and `egress` gains managed identity support for its Azure uploader (`pkg/config/storage.go`). Report both to the maintainer.

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: amend the `Added` > `Deployment` entry on Azure managed identity (new in 3.10.0, #116) to say `AZURE_CLIENT_ID` selects a user-assigned identity; no line of its own.
- [ ] 3.2 openvidu.io on `next`: on the Azure storage and Meet configuration pages, document `AZURE_CLIENT_ID` and state that the recorder still needs the account key. Find the pages with `grep -rl MEET_AZURE_ACCOUNT_KEY ../openvidu.io/docs`.
