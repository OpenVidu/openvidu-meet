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
 * A deprecated (`can*`) permission key, replaced by its current `moduleAbility` key(s).
 */
export type MeetDeprecatedPermissionKey = keyof typeof MEET_PERMISSION_ALIASES;

/**
 * A current `moduleAbility` permission key.
 */
export type MeetPermissionKey = (typeof MEET_PERMISSION_ALIASES)[MeetDeprecatedPermissionKey][number];

// Compile-time guard: every key declared on the interface must be reachable through the alias map
// (the reverse direction — map values being valid keys — is enforced by the `satisfies` clause
// above). If a new permission is ever added to the interface without an alias entry, the constraint
// below is violated and this file stops compiling, forcing the author to decide how the deprecated
// surface represents the new key.
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

// Flattens the alias groups. Written with `concat` because this package targets `lib: es2017`, where
// `Array.prototype.flat` does not exist yet.
function flattenPermissionAliases(): readonly MeetPermissionKey[] {
	let flattened: MeetPermissionKey[] = [];

	for (const replacementKeys of Object.values(MEET_PERMISSION_ALIASES)) {
		flattened = flattened.concat(replacementKeys as readonly MeetPermissionKey[]);
	}

	return flattened;
}

/**
 * Every current permission key, in the order they are documented.
 */
export const MEET_PERMISSION_KEYS = flattenPermissionAliases();

// Inverts MEET_PERMISSION_ALIASES. Written as a loop because this package targets `lib: es2017`,
// where `Object.fromEntries` does not exist yet. Many-to-one: the three recording retrieval keys all
// point back at `canRetrieveRecordings`.
function invertPermissionAliases(): Record<MeetPermissionKey, MeetDeprecatedPermissionKey> {
	const inverted = {} as Record<MeetPermissionKey, MeetDeprecatedPermissionKey>;

	for (const [deprecatedKey, replacementKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		for (const replacementKey of replacementKeys as readonly MeetPermissionKey[]) {
			inverted[replacementKey] = deprecatedKey as MeetDeprecatedPermissionKey;
		}
	}

	return inverted;
}

/**
 * Reverse of {@link MEET_PERMISSION_ALIASES}: current key → the deprecated key it replaces. Several
 * current keys can share one deprecated key (the recording retrieval split).
 *
 * Removed in **3.12.0** together with the deprecated aliases.
 */
export const MEET_PERMISSION_DEPRECATED_ALIASES: Readonly<Record<MeetPermissionKey, MeetDeprecatedPermissionKey>> =
	Object.freeze(invertPermissionAliases());

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
 * @param input - A permission object with deprecated keys, current keys, or a mix of both
 * @returns The same permissions under the current keys
 */
export function normalizePermissions(input: MeetPermissionsInput): Partial<Record<MeetPermissionKey, boolean>> {
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

	return normalized;
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
 * Finds alias keys supplied together with a replacement key that contradicts them. An empty array
 * means the input is unambiguous and safe to {@link normalizePermissions}.
 *
 * A split alias is checked against **every** key of its group, so
 * `{ canRetrieveRecordings: true, recordingDownload: false }` is reported: the caller is asking for
 * two different things at once and the request should be rejected rather than silently resolved.
 *
 * Removed in **3.12.0** together with the deprecated aliases.
 *
 * @param input - A permission object with deprecated keys, current keys, or a mix of both
 * @returns One entry per contradicting pair
 */
export function findPermissionAliasConflicts(input: MeetPermissionsInput): MeetPermissionAliasConflict[] {
	const record = input as Readonly<Record<string, unknown>>;
	const conflicts: MeetPermissionAliasConflict[] = [];

	for (const [deprecatedKey, replacementKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		const deprecatedValue = record[deprecatedKey];

		if (typeof deprecatedValue !== 'boolean') {
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
