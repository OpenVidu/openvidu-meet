/**
 * Canonical module registry of the Meet API naming scheme (`moduleAction` / `moduleEvent` /
 * `moduleAbility`). Every public identifier — permission keys, embedding commands and events,
 * webhook event types and new `operationId`s — starts with exactly one of these tokens, and the
 * registry is the **enforcement point**: `scripts/lint-api-naming.mjs` (wired into
 * `./meet.sh lint-backend`, so it gates CI) fails when an identifier doesn't resolve to a
 * registered module. The naming charter itself lives in this package's `CLAUDE.md` and in
 * `meet-ce/backend/openapi/README.md`.
 *
 * Rules for the tokens (charter §"Module"):
 *
 * - A **singular, single-word** lowerCamelCase noun. A concept that would need two words is not a
 *   module — fold it into the closest existing one and put the extra word in the action/ability
 *   (virtual background → `media` as `mediaChangeVirtualBackground`, not a `virtualBackground`
 *   module).
 * - A token belongs to **exactly one** module, and no token may be a prefix of another (prefix
 *   matching would turn ambiguous).
 * - Reserved meanings: `broadcast` is RTMP egress only, `reaction` is the emoji overlay only, and
 *   chat content is `message`/`messages` only.
 *
 * The list covers the implemented modules and the ones the API studies already commit to
 * (`lobby`, `hand`, `breakout`, `notes`, `whiteboard`, `file`, `reaction`, `broadcast`), so a
 * future feature lands with its naming already decided.
 */
export const MEET_API_MODULES = [
	'room',
	'meeting',
	'participant',
	'media',
	'recording',
	'broadcast',
	'lobby',
	'chat',
	'file',
	'reaction',
	'hand',
	'breakout',
	'notes',
	'whiteboard',
	'webhook'
] as const;

/** A registered module token of the Meet API naming scheme. See {@link MEET_API_MODULES}. */
export type MeetApiModule = (typeof MEET_API_MODULES)[number];

/**
 * Top-level REST path segments the two OpenAPI specs may use. Feature modules only appear here
 * when they own a **durable artifact or configuration** (`rooms`, `recordings`, `webhooks`,
 * `meetings`); every live-meeting feature is a sub-resource of `/meetings/{roomId}` instead of a
 * new top-level group. The rest are the platform groups (account, auth, deployment config) that
 * predate the module scheme. Adding a segment here is an API-design decision, not a formality —
 * the naming lint fails on any path outside this list.
 */
export const MEET_API_REST_GROUPS = [
	'rooms',
	'recordings',
	'meetings',
	'webhooks',
	'users',
	'auth',
	'api-keys',
	'config',
	'analytics',
	'ai',
	'health'
] as const;

/**
 * Resolves the registered module token an identifier belongs to, or `undefined` when it starts
 * with none of them. A match requires the token to be followed by an **uppercase** letter
 * (`meetingJoin` → `meeting`), so a bare token or an accidental prefix (`mediation…`) never
 * matches; when tokens could overlap, the longest one wins.
 */
export const meetApiModuleOf = (identifier: string): MeetApiModule | undefined => {
	let match: MeetApiModule | undefined = undefined;

	for (const moduleToken of MEET_API_MODULES) {
		if (
			identifier.length > moduleToken.length &&
			identifier.startsWith(moduleToken) &&
			identifier[moduleToken.length] >= 'A' &&
			identifier[moduleToken.length] <= 'Z' &&
			(!match || moduleToken.length > match.length)
		) {
			match = moduleToken;
		}
	}

	return match;
};
