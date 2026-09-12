/**
 * List of permissions for a room member, keyed with the current `moduleAbility` scheme (module
 * first, no `can` prefix). This is the shape the API stores and, from 3.9.0 on, the one it speaks.
 * While a deployment runs in **compatibility mode** (`MEET_MODE=compatibility`, the default) the
 * deprecated `can*` spellings ({@link MeetRoomMemberDeprecatedPermissions}) are still accepted on
 * input and served alongside these keys on output — see {@link MEET_PERMISSION_ALIASES} for the
 * mapping.
 *
 * `canRetrieveRecordings` was **split into three** keys (`recordingList`, `recordingPlay`,
 * `recordingDownload`): enumerating recordings, playing one and downloading a copy are different
 * capabilities. Granting the deprecated flag grants the whole group.
 */
export interface MeetRoomMemberPermissions {
	/**
	 * Can start and stop recordings of the meeting.
	 */
	recordingControl: boolean;
	/**
	 * Can enumerate the room's recordings.
	 */
	recordingList: boolean;
	/**
	 * Can open and play back a recording.
	 */
	recordingPlay: boolean;
	/**
	 * Can download a copy of a recording (individually or as a ZIP).
	 */
	recordingDownload: boolean;
	/**
	 * Can delete recordings.
	 */
	recordingDelete: boolean;
	/**
	 * Can join the meeting.
	 */
	meetingJoin: boolean;
	/**
	 * Can read the live state of the meeting (its info and the participants currently in it) without
	 * necessarily joining it.
	 *
	 * Introduced after the rename, so it has no deprecated `can*` spelling (see
	 * {@link MEET_UNALIASED_PERMISSION_KEYS}). It is independent of every other permission: a request
	 * that omits it leaves it at whatever the role or the member already had. Only a set completed
	 * from scratch, which is what a stored document migrated from before 3.9.0 and a token issued
	 * back then go through, derives it from `meetingJoin`, the permission that gated this capability
	 * before this one existed (see {@link UNALIASED_PERMISSION_DEFAULTS}).
	 */
	meetingRead: boolean;
	/**
	 * Can share room access links to invite others.
	 */
	roomShareAccessLinks: boolean;
	/**
	 * Can promote other participants to the moderator role.
	 */
	participantPromote: boolean;
	/**
	 * Can remove other participants from the meeting.
	 */
	participantKick: boolean;
	/**
	 * Can turn off another participant's microphone, camera or screen share in the meeting. The
	 * affected participant may turn the device back on: this mutes, it does not revoke
	 * `mediaPublishAudio`/`mediaPublishVideo`/`mediaShareScreen`.
	 *
	 * Introduced after the rename, so it has no deprecated `can*` spelling (see
	 * {@link MEET_UNALIASED_PERMISSION_KEYS}). It is independent of every other permission: a request
	 * that omits it leaves it at whatever the role or the member already had. Only a set completed
	 * from scratch, which is what a stored document migrated from before 3.9.0 and a token issued
	 * back then go through, starts it at `false` (see {@link UNALIASED_PERMISSION_DEFAULTS}).
	 */
	participantMute: boolean;
	/**
	 * Can end the meeting for all participants.
	 */
	meetingEnd: boolean;
	/**
	 * Can publish camera video in the meeting.
	 */
	mediaPublishVideo: boolean;
	/**
	 * Can publish microphone audio in the meeting.
	 */
	mediaPublishAudio: boolean;
	/**
	 * Can share the screen in the meeting.
	 */
	mediaShareScreen: boolean;
	/**
	 * Can read chat messages in the meeting.
	 */
	chatRead: boolean;
	/**
	 * Can send chat messages in the meeting.
	 */
	chatWrite: boolean;
	/**
	 * Can change the virtual background.
	 */
	mediaChangeVirtualBackground: boolean;
}

/**
 * The deprecated `can*` spellings of {@link MeetRoomMemberPermissions}. In compatibility mode
 * (`MEET_MODE=compatibility`) requests may still use these keys (they are normalized through
 * {@link MEET_PERMISSION_ALIASES}) and responses carry them alongside the current keys; with
 * `MEET_MODE='3.9.0'` they are neither accepted nor served.
 *
 * @deprecated Use the current keys of {@link MeetRoomMemberPermissions}. Removed in 3.12.0.
 */
export interface MeetRoomMemberDeprecatedPermissions {
	/**
	 * Can start/stop recording the meeting.
	 * @deprecated Renamed to `recordingControl`. Removed in 3.12.0.
	 */
	canRecord: boolean;
	/**
	 * Can list and play recordings.
	 * @deprecated Split into `recordingList` + `recordingPlay` + `recordingDownload`. Removed in 3.12.0.
	 */
	canRetrieveRecordings: boolean;
	/**
	 * Can delete recordings.
	 * @deprecated Renamed to `recordingDelete`. Removed in 3.12.0.
	 */
	canDeleteRecordings: boolean;
	/**
	 * Can join the meeting.
	 * @deprecated Renamed to `meetingJoin`. Removed in 3.12.0.
	 */
	canJoinMeeting: boolean;
	/**
	 * Can share access links to invite others.
	 * @deprecated Renamed to `roomShareAccessLinks`. Removed in 3.12.0.
	 */
	canShareAccessLinks: boolean;
	/**
	 * Can promote other participants to moderator role.
	 * @deprecated Renamed to `participantPromote`. Removed in 3.12.0.
	 */
	canMakeModerator: boolean;
	/**
	 * Can remove other participants from the meeting.
	 * @deprecated Renamed to `participantKick`. Removed in 3.12.0.
	 */
	canKickParticipants: boolean;
	/**
	 * Can end the meeting for all participants.
	 * @deprecated Renamed to `meetingEnd`. Removed in 3.12.0.
	 */
	canEndMeeting: boolean;
	/**
	 * Can publish video in the meeting.
	 * @deprecated Renamed to `mediaPublishVideo`. Removed in 3.12.0.
	 */
	canPublishVideo: boolean;
	/**
	 * Can publish audio in the meeting.
	 * @deprecated Renamed to `mediaPublishAudio`. Removed in 3.12.0.
	 */
	canPublishAudio: boolean;
	/**
	 * Can share screen in the meeting.
	 * @deprecated Renamed to `mediaShareScreen`. Removed in 3.12.0.
	 */
	canShareScreen: boolean;
	/**
	 * Can read chat messages in the meeting.
	 * @deprecated Renamed to `chatRead`. Removed in 3.12.0.
	 */
	canReadChat: boolean;
	/**
	 * Can send chat messages in the meeting.
	 * @deprecated Renamed to `chatWrite`. Removed in 3.12.0.
	 */
	canWriteChat: boolean;
	/**
	 * Can change the virtual background.
	 * @deprecated Renamed to `mediaChangeVirtualBackground`. Removed in 3.12.0.
	 */
	canChangeVirtualBackground: boolean;
}

/**
 * Maps every deprecated permission key to the current `moduleAbility` key(s) that replace it.
 *
 * This map is the **single source of truth** for the rename: request validation, response
 * serialization, the schema migrations, the UI and the naming lint all derive their behaviour from it
 * instead of hardcoding pairs.
 *
 * Most entries are a straight rename (one replacement key). `canRetrieveRecordings` is **split into
 * three**, because enumerating a room's recordings, playing one you already know and downloading a
 * copy are different capabilities that deployments need to grant separately (a share link that plays
 * but does not download, for instance). Whoever wants the old behaviour grants the three.
 *
 * Naming rules it encodes: the module comes first, `Admin` is the single administrative verb (every
 * capability of the module that no specific permission already covers) and is therefore absent from
 * a module that is fully split like `recording`, the verb always precedes the object, and the keys
 * stay flat — never nested per module.
 *
 * The deprecated keys keep working while `MEET_MODE=compatibility` — accepted on input, served on
 * output alongside the current keys — until they are **removed in 3.12.0**.
 */
export const MEET_PERMISSION_ALIASES = {
	canRecord: ['recordingControl'],
	canRetrieveRecordings: ['recordingList', 'recordingPlay', 'recordingDownload'],
	canDeleteRecordings: ['recordingDelete'],
	canJoinMeeting: ['meetingJoin'],
	canShareAccessLinks: ['roomShareAccessLinks'],
	canMakeModerator: ['participantPromote'],
	canKickParticipants: ['participantKick'],
	canEndMeeting: ['meetingEnd'],
	canPublishVideo: ['mediaPublishVideo'],
	canPublishAudio: ['mediaPublishAudio'],
	canShareScreen: ['mediaShareScreen'],
	canReadChat: ['chatRead'],
	canWriteChat: ['chatWrite'],
	canChangeVirtualBackground: ['mediaChangeVirtualBackground']
} as const satisfies Readonly<
	Record<keyof MeetRoomMemberDeprecatedPermissions, readonly (keyof MeetRoomMemberPermissions)[]>
>;

/**
 * What each key introduced after the rename completes to when a **complete** input omits it: either
 * the value of another permission, or a literal.
 *
 * Those keys are missing from everything issued before they shipped: tokens of meetings in progress,
 * stored documents awaiting their migration, requests from clients built against the previous
 * contract, and every input that spells its permissions the deprecated way. Rejecting those (the
 * schemas require a complete set) would interrupt live meetings and break integrations over a
 * permission they cannot even name yet.
 *
 * These are starting values, not implications: every permission is independent of every other, an
 * explicit value always wins, and a patch over stored permissions receives none of them — an absent
 * key there means "not touched", and writing one would change a permission the caller never
 * mentioned.
 *
 * - `meetingRead` ← the value of `meetingJoin`, which gated the live meeting reads before this key
 *   existed, so a complete input that cannot name it keeps behaving as it did. An operator grants
 *   the two apart by naming both (observe without entering, or enter without observing).
 * - `participantMute` ← `false`: a moderation capability nothing hands out unasked. Deliberately
 *   not derived from `participantKick` — removing someone from a meeting and silencing their
 *   microphone are different powers, and a deployment that granted one never decided on the other.
 */
const UNALIASED_PERMISSION_DEFAULTS = {
	meetingRead: 'meetingJoin',
	participantMute: false
} as const satisfies Readonly<
	Partial<Record<keyof MeetRoomMemberPermissions, keyof MeetRoomMemberPermissions | boolean>>
>;

/**
 * Permission keys that have **no** deprecated `can*` spelling, because they were introduced after
 * the rename froze that surface. They are part of the contract like any other key, they simply never
 * appear in {@link MEET_PERMISSION_ALIASES}, in a compatibility-mode response or in a request that
 * uses the deprecated spellings — a client that only knows the `can*` names cannot express them.
 *
 * The deprecated set stays frozen at its 14 keys until 3.12.0: a capability that did not exist in
 * 3.8.0 never gets a `can*` name invented for it. Every permission added from now on belongs here.
 *
 * There is no "unset" permission — the effective value must always be a boolean — so every key here
 * declares in {@link UNALIASED_PERMISSION_DEFAULTS} what it completes to when a complete input omits
 * it.
 */
export const MEET_UNALIASED_PERMISSION_KEYS = Object.keys(
	UNALIASED_PERMISSION_DEFAULTS
) as readonly (keyof typeof UNALIASED_PERMISSION_DEFAULTS)[];

/**
 * A deprecated (`can*`) permission key, replaced by its current `moduleAbility` key(s).
 */
export type MeetDeprecatedPermissionKey = keyof typeof MEET_PERMISSION_ALIASES;

/**
 * A current `moduleAbility` permission key: either the replacement of a deprecated one, or a key
 * introduced after the rename ({@link MEET_UNALIASED_PERMISSION_KEYS}).
 */
export type MeetPermissionKey =
	| (typeof MEET_PERMISSION_ALIASES)[MeetDeprecatedPermissionKey][number]
	| (typeof MEET_UNALIASED_PERMISSION_KEYS)[number];

// Compile-time guard: every key declared on the interface must be reachable through the alias map or
// listed in MEET_UNALIASED_PERMISSION_KEYS (the reverse direction — map values being valid keys — is
// enforced by the `satisfies` clauses above). If a new permission is ever added to the interface
// without appearing in either place, the constraint below is violated and this file stops compiling,
// forcing the author to decide how the deprecated surface represents the new key: as part of an
// existing `can*` group, or (the normal answer for anything born after the rename) not at all.
type _RequireTrue<T extends true> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AssertAliasMapCoversPermissions = _RequireTrue<
	Exclude<keyof MeetRoomMemberPermissions, MeetPermissionKey> extends never ? true : false
>;

/**
 * Every deprecated permission key, in the order they are documented.
 *
 * Removed in **3.12.0** together with the deprecated aliases. Not tagged `@deprecated` on purpose:
 * the backend enforces `no-deprecated` as an error and every compatibility-mode code path (request
 * normalization, response serialization, the schema migrations) legitimately calls the alias
 * helpers until the window closes.
 */
export const MEET_DEPRECATED_PERMISSION_KEYS = Object.keys(
	MEET_PERMISSION_ALIASES
) as readonly MeetDeprecatedPermissionKey[];

// Flattens the alias groups and appends the keys that never had a deprecated spelling. Written with
// `concat` because this package targets `lib: es2017`, where `Array.prototype.flat` does not exist yet.
function collectPermissionKeys(): readonly MeetPermissionKey[] {
	let collected: MeetPermissionKey[] = [];

	for (const replacementKeys of Object.values(MEET_PERMISSION_ALIASES)) {
		collected = collected.concat(replacementKeys as readonly MeetPermissionKey[]);
	}

	return collected.concat(MEET_UNALIASED_PERMISSION_KEYS as readonly MeetPermissionKey[]);
}

/**
 * Every current permission key, in the order they are documented.
 */
export const MEET_PERMISSION_KEYS = collectPermissionKeys();

// Inverts MEET_PERMISSION_ALIASES. Written as a loop because this package targets `lib: es2017`,
// where `Object.fromEntries` does not exist yet. Many-to-one: the three recording retrieval keys all
// point back at `canRetrieveRecordings`. Partial by construction: the keys of
// MEET_UNALIASED_PERMISSION_KEYS have no deprecated spelling to point back at.
function invertPermissionAliases(): Partial<Record<MeetPermissionKey, MeetDeprecatedPermissionKey>> {
	const inverted: Partial<Record<MeetPermissionKey, MeetDeprecatedPermissionKey>> = {};

	for (const [deprecatedKey, replacementKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		for (const replacementKey of replacementKeys as readonly MeetPermissionKey[]) {
			inverted[replacementKey] = deprecatedKey as MeetDeprecatedPermissionKey;
		}
	}

	return inverted;
}

/**
 * Reverse of {@link MEET_PERMISSION_ALIASES}: current key → the deprecated key it replaces. Several
 * current keys can share one deprecated key (the recording retrieval split), and the keys listed in
 * {@link MEET_UNALIASED_PERMISSION_KEYS} have no entry at all.
 *
 * Removed in **3.12.0** together with the deprecated aliases.
 */
export const MEET_PERMISSION_DEPRECATED_ALIASES: Readonly<
	Partial<Record<MeetPermissionKey, MeetDeprecatedPermissionKey>>
> = Object.freeze(invertPermissionAliases());

/**
 * A permission object as it arrives from an untrusted source (an HTTP body, a decoded token), where
 * deprecated and current keys may be mixed and values are not yet validated. Objects already typed
 * as {@link MeetRoomMemberPermissions} are accepted too, so migration/normalization call sites can
 * pass typed values whose runtime keys may still be the deprecated ones (a lean Mongo document, a
 * cached token).
 */
export type MeetPermissionsInput = Readonly<Record<string, unknown>> | Readonly<Partial<MeetRoomMemberPermissions>>;

/**
 * A permission alias pair present in the same input with **conflicting** values.
 */
export interface MeetPermissionAliasConflict {
	/** The deprecated key that was supplied. */
	deprecatedKey: MeetDeprecatedPermissionKey;
	/** The replacement key that was supplied alongside it. */
	replacementKey: MeetPermissionKey;
	/** Value supplied under the deprecated key. */
	deprecatedValue: boolean;
	/** Value supplied under the replacement key. */
	replacementValue: boolean;
}

/**
 * Rewrites a permission object to the current keys, dropping anything that is neither a known key
 * nor a boolean. Deprecated keys are applied first, so an explicit current key always wins over its
 * alias — callers that must reject a contradiction should run {@link findPermissionAliasConflicts}
 * first.
 *
 * When the caller asks for a `complete` set, the post-rename keys the input omitted are then filled
 * from {@link UNALIASED_PERMISSION_DEFAULTS}. A patch over stored permissions receives no defaults —
 * an absent key there means "not touched", and writing one would change a permission the caller
 * never mentioned.
 *
 * @param input - A permission object with deprecated keys, current keys, or a mix of both
 * @param options - `complete` also fills the defaults, for a caller producing a whole set
 * @returns The same permissions under the current keys
 */
export function normalizePermissions(
	input: MeetPermissionsInput,
	options: { complete?: boolean } = {}
): Partial<Record<MeetPermissionKey, boolean>> {
	const record = input as Readonly<Record<string, unknown>>;
	const normalized: Partial<Record<MeetPermissionKey, boolean>> = {};

	for (const [deprecatedKey, replacementKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		const value = record[deprecatedKey];

		if (typeof value === 'boolean') {
			// A split alias grants (or denies) its whole group: `canRetrieveRecordings: true` means
			// list + play + download, which is exactly what that flag allowed before the split.
			for (const replacementKey of replacementKeys as readonly MeetPermissionKey[]) {
				normalized[replacementKey] = value;
			}
		}
	}

	for (const permissionKey of MEET_PERMISSION_KEYS) {
		const value = record[permissionKey];

		if (typeof value === 'boolean') {
			normalized[permissionKey] = value;
		}
	}

	applyUnaliasedPermissionDefaults(normalized, options.complete === true);
	return normalized;
}

/**
 * Fills the keys of {@link MEET_UNALIASED_PERMISSION_KEYS} a complete input did not carry, from
 * {@link UNALIASED_PERMISSION_DEFAULTS}. A patch receives none. Mutates the object it is given.
 */
function applyUnaliasedPermissionDefaults(
	permissions: Partial<Record<MeetPermissionKey, boolean>>,
	complete: boolean
): void {
	if (!complete) {
		return;
	}

	const entries = Object.entries(UNALIASED_PERMISSION_DEFAULTS) as [MeetPermissionKey, MeetPermissionKey | boolean][];

	for (const [permissionKey, resolution] of entries) {
		if (typeof permissions[permissionKey] === 'boolean') {
			continue;
		}

		const value = typeof resolution === 'boolean' ? resolution : permissions[resolution];

		if (typeof value === 'boolean') {
			permissions[permissionKey] = value;
		}
	}
}

/**
 * Derives the deprecated `can*` spellings of a permission object keyed with the current names, for
 * compatibility-mode responses and webhooks. Keys with no boolean value are omitted.
 *
 * A **split** alias collapses with AND: `canRetrieveRecordings` is true only when list, play and
 * download are all granted, and is omitted when any of the three is missing from the input. The old
 * flag cannot express "play but not download", so the conservative reading is the safe one — an old
 * client then hides the feature instead of offering a button that would be rejected with a 403.
 *
 * Removed in **3.12.0** together with the deprecated aliases (see
 * {@link MEET_DEPRECATED_PERMISSION_KEYS} for why it is not tagged `@deprecated`).
 *
 * @param permissions - Permissions under the current keys
 * @returns The same permissions under the deprecated `can*` names
 */
export function toDeprecatedPermissions(
	permissions: Readonly<Partial<Record<MeetPermissionKey, boolean>>>
): Partial<Record<MeetDeprecatedPermissionKey, boolean>> {
	const deprecated: Partial<Record<MeetDeprecatedPermissionKey, boolean>> = {};

	for (const [deprecatedKey, replacementKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		let collapsed: boolean | undefined = true;

		for (const replacementKey of replacementKeys as readonly MeetPermissionKey[]) {
			const value = permissions[replacementKey];

			if (typeof value !== 'boolean') {
				collapsed = undefined;
				break;
			}

			collapsed = collapsed && value;
		}

		if (typeof collapsed === 'boolean') {
			deprecated[deprecatedKey as MeetDeprecatedPermissionKey] = collapsed;
		}
	}

	return deprecated;
}

/**
 * Finds alias keys supplied together with replacement keys that contradict them. An empty array
 * means the input is unambiguous and safe to {@link normalizePermissions}.
 *
 * An alias equal to what {@link toDeprecatedPermissions} derives from the supplied current keys is
 * redundant, not a conflict — a compatibility-mode response echoed back unchanged is always valid
 * input. Everything else is checked key by key: `{ canRetrieveRecordings: true, recordingDownload:
 * false }` is reported (the alias grants the whole group), and so is a stale
 * `canRetrieveRecordings: false` next to an all-true group — resolving that silently would leave
 * granted a permission the caller meant to revoke.
 *
 * Removed in **3.12.0** together with the deprecated aliases.
 *
 * @param input - A permission object with deprecated keys, current keys, or a mix of both
 * @returns One entry per contradicting pair
 */
export function findPermissionAliasConflicts(input: MeetPermissionsInput): MeetPermissionAliasConflict[] {
	const record = input as Readonly<Record<string, unknown>>;
	const serialized = toDeprecatedPermissions(record as Readonly<Partial<Record<MeetPermissionKey, boolean>>>);
	const conflicts: MeetPermissionAliasConflict[] = [];

	for (const [deprecatedKey, replacementKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		const deprecatedValue = record[deprecatedKey];

		if (typeof deprecatedValue !== 'boolean') {
			continue;
		}

		if (deprecatedValue === serialized[deprecatedKey as MeetDeprecatedPermissionKey]) {
			continue;
		}

		for (const replacementKey of replacementKeys as readonly MeetPermissionKey[]) {
			const replacementValue = record[replacementKey];

			if (typeof replacementValue === 'boolean' && replacementValue !== deprecatedValue) {
				conflicts.push({
					deprecatedKey: deprecatedKey as MeetDeprecatedPermissionKey,
					replacementKey,
					deprecatedValue,
					replacementValue
				});
			}
		}
	}

	return conflicts;
}
