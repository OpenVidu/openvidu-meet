#!/usr/bin/env node
/**
 * API naming lint — the enforcement point of the naming charter (typings `CLAUDE.md`,
 * `meet-ce/backend/openapi/README.md`). Runs from `./meet.sh lint-backend`, which CI executes, and
 * fails when a public identifier steps outside the `moduleAction` / `moduleEvent` / `moduleAbility`
 * scheme:
 *
 *   1. Registry hygiene — module tokens are single-word lowercase, unique, and none is a prefix of
 *      another (prefix matching would turn ambiguous).
 *   2. Every permission key, embedding command/event and webhook event type starts with a
 *      registered module token. The deprecated 3.8.0 aliases are exempt, derived from the alias
 *      maps so the exemption list shrinks to nothing when the aliases are removed in 3.12.0.
 *   3. Every OpenAPI `operationId` starts with a registered module token, except the frozen
 *      pre-charter list below (aligned in the next major, when SDK method names may break).
 *   4. Every top-level REST path segment of both specs belongs to `MEET_API_REST_GROUPS` — live
 *      meeting features go under `/meetings/{roomId}`, not new top-level groups.
 *
 * Requires `meet-ce/typings/dist` to be built (meet.sh builds it before linting).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const typingsDist = join(repoRoot, 'meet-ce/typings/dist/index.js');
const openapiDir = join(repoRoot, 'meet-ce/backend/openapi');

/**
 * `operationId`s that predate the charter, frozen verbatim: public ones generate SDK method names,
 * so they keep their spelling until the next major (migration plan §D7/§8.5). Do NOT add entries —
 * a new operation must be named `moduleAction` from day one.
 */
const PRE_CHARTER_OPERATION_IDS = new Set([
	// auth / api-keys / users (platform groups)
	'loginUser',
	'logoutUser',
	'refreshAccessToken',
	'createApiKey',
	'deleteApiKeys',
	'getApiKeys',
	'bulkDeleteUsers',
	'changeUserPassword',
	'createUser',
	'deleteUser',
	'getMe',
	'getUser',
	'getUsers',
	'resetUserPassword',
	'updateUserRole',
	// config / analytics / ai
	'getCaptionsConfig',
	'getRoomsAppearanceConfig',
	'getSecurityConfig',
	'getWebhooksConfig',
	'testWebhookUrl',
	'updateRoomsAppearanceConfig',
	'updateSecurityConfig',
	'updateWebhooksConfig',
	'getAnalytics',
	'cancelAiAssistant',
	'createAiAssistant',
	// rooms / room members
	'bulkDeleteRooms',
	'createRoom',
	'deleteRoom',
	'getRoom',
	'getRoomConfig',
	'getRooms',
	'updateRoomAccess',
	'updateRoomConfig',
	'updateRoomRoles',
	'updateRoomStatus',
	'addRoomMember',
	'bulkDeleteRoomMembers',
	'deleteRoomMember',
	'getRoomMember',
	'getRoomMembers',
	'updateRoomMember',
	'generateRoomMemberToken',
	'refreshRoomMemberToken',
	// recordings
	'bulkDeleteRecordings',
	'deleteRecording',
	'downloadRecording',
	'downloadRecordings',
	'getRecording',
	'getRecordingMedia',
	'getRecordings',
	'getRecordingUrl',
	'startRecording',
	'stopRecording'
]);

const errors = [];
const fail = (message) => errors.push(message);

let typings;

try {
	typings = await import(pathToFileURL(typingsDist).href);
} catch {
	console.error(`✖ Cannot load '${typingsDist}'. Build the typings first (./meet.sh build-typings).`);
	process.exit(1);
}

const {
	MEET_API_MODULES,
	MEET_API_REST_GROUPS,
	meetApiModuleOf,
	MEET_PERMISSION_KEYS,
	EmbeddedCommandName,
	EmbeddedEventName,
	MeetWebhookEventType,
	EMBEDDED_COMMAND_ALIASES,
	EMBEDDED_EVENT_ALIASES
} = typings;

// ── 1. Registry hygiene ─────────────────────────────────────────────────────

for (const token of MEET_API_MODULES) {
	if (!/^[a-z]+$/.test(token)) {
		fail(`module token '${token}' must be a single lowercase word`);
	}
}

if (new Set(MEET_API_MODULES).size !== MEET_API_MODULES.length) {
	fail('module tokens must be unique (a token belongs to exactly one module)');
}

for (const a of MEET_API_MODULES) {
	for (const b of MEET_API_MODULES) {
		if (a !== b && b.startsWith(a)) {
			fail(`module token '${a}' is a prefix of '${b}' — prefix matching would turn ambiguous`);
		}
	}
}

// ── 2. Enum members and permission keys ─────────────────────────────────────

// The 3.8.0 aliases are exempt while they live in the enums; deriving the exemption from the alias
// maps means it disappears together with the aliases in 3.12.0.
const deprecatedNames = new Set([...Object.keys(EMBEDDED_COMMAND_ALIASES), ...Object.keys(EMBEDDED_EVENT_ALIASES)]);

const checkIdentifiers = (surface, identifiers) => {
	for (const identifier of identifiers) {
		if (!deprecatedNames.has(identifier) && !meetApiModuleOf(identifier)) {
			fail(`${surface}: '${identifier}' does not start with a registered module token`);
		}
	}
};

checkIdentifiers('permission key', MEET_PERMISSION_KEYS);
checkIdentifiers('embedded command', Object.values(EmbeddedCommandName));
checkIdentifiers('embedded event', Object.values(EmbeddedEventName));
checkIdentifiers('webhook event type', Object.values(MeetWebhookEventType));

// ── 3. OpenAPI operationIds ─────────────────────────────────────────────────

const yamlFiles = readdirSync(openapiDir, { recursive: true })
	.filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
	.map((file) => join(openapiDir, file));

let operationIdCount = 0;

for (const file of yamlFiles) {
	const content = readFileSync(file, 'utf8');

	for (const match of content.matchAll(/^\s*operationId:\s*(\S+)\s*$/gm)) {
		const operationId = match[1];
		operationIdCount++;

		if (!PRE_CHARTER_OPERATION_IDS.has(operationId) && !meetApiModuleOf(operationId)) {
			fail(
				`operationId '${operationId}' (${file.slice(repoRoot.length + 1)}) does not start with a ` +
					`registered module token — new operations are named moduleAction from day one`
			);
		}
	}
}

// ── 4. Top-level REST path segments ─────────────────────────────────────────

const restGroups = new Set(MEET_API_REST_GROUPS);
const rootSpecs = ['openvidu-meet-api.yaml', 'openvidu-meet-internal-api.yaml'].map((file) => join(openapiDir, file));

let pathCount = 0;

for (const file of rootSpecs) {
	const content = readFileSync(file, 'utf8');

	for (const match of content.matchAll(/^\s+(\/[^\s:]*):/gm)) {
		const topSegment = match[1].split('/')[1];
		pathCount++;

		if (!restGroups.has(topSegment)) {
			fail(
				`path '${match[1]}' (${file.slice(repoRoot.length + 1)}) introduces top-level group ` +
					`'/${topSegment}' outside MEET_API_REST_GROUPS — live meeting state belongs under /meetings/{roomId}`
			);
		}
	}
}

// ── Report ──────────────────────────────────────────────────────────────────

if (errors.length > 0) {
	console.error(`✖ API naming lint failed (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n`);

	for (const error of errors) {
		console.error(`  - ${error}`);
	}

	console.error(
		'\n  Charter: meet-ce/typings/CLAUDE.md ("API naming charter") · registry: meet-ce/typings/src/api-registry.ts'
	);
	process.exit(1);
}

console.log(
	`✔ API naming lint: ${MEET_API_MODULES.length} module tokens, ` +
		`${MEET_PERMISSION_KEYS.length} permission keys, ` +
		`${Object.values(EmbeddedCommandName).length + Object.values(EmbeddedEventName).length} embedded members, ` +
		`${Object.values(MeetWebhookEventType).length} webhook types, ` +
		`${operationIdCount} operationIds and ${pathCount} paths conform`
);
