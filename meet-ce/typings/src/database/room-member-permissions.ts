/**
 * List of permissions for a room member.
 *
 * The key names are being renamed to the `moduleAbility` scheme (module first, no `can` prefix), and
 * `canRetrieveRecordings` is being split into three: see {@link MEET_PERMISSION_ALIASES} for the
 * old → new mapping. This interface still declares the legacy keys until the rename lands across the
 * API, the persistence layer and the UI in one step; the legacy names are removed in **3.12.0**.
 */
export interface MeetRoomMemberPermissions {
	/**
	 * Can start/stop recording the meeting.
	 */
	canRecord: boolean;
	/**
	 * Can list and play recordings.
	 */
	canRetrieveRecordings: boolean;
	/**
	 * Can delete recordings.
	 */
	canDeleteRecordings: boolean;
	/**
	 * Can join the meeting.
	 */
	canJoinMeeting: boolean;
	/**
	 * Can share access links to invite others.
	 */
	canShareAccessLinks: boolean;
	/**
	 * Can promote other participants to moderator role.
	 */
	canMakeModerator: boolean;
	/**
	 * Can remove other participants from the meeting.
	 */
	canKickParticipants: boolean;
	/**
	 * Can end the meeting for all participants.
	 */
	canEndMeeting: boolean;
	/**
	 * Can publish video in the meeting.
	 */
	canPublishVideo: boolean;
	/**
	 * Can publish audio in the meeting.
	 */
	canPublishAudio: boolean;
	/**
	 * Can share screen in the meeting.
	 */
	canShareScreen: boolean;
	/**
	 * Can read chat messages in the meeting.
	 */
	canReadChat: boolean;
	/**
	 * Can send chat messages in the meeting.
	 */
	canWriteChat: boolean;
	/**
	 * Can change the virtual background.
	 */
	canChangeVirtualBackground: boolean;
}

/**
 * Maps every legacy permission key to the canonical `moduleAbility` key(s) that replace it.
 *
 * This map is the **single source of truth** for the rename: request validation, response
 * serialization, the schema migrations, the UI and the naming lint all derive their behaviour from it
 * instead of hardcoding pairs.
 *
 * Most entries are a straight rename (one canonical key). `canRetrieveRecordings` is **split into
 * three**, because enumerating a room's recordings, playing one you already know and downloading a
 * copy are different capabilities that deployments need to grant separately (a share link that plays
 * but does not download, for instance). Whoever wants the old behaviour grants the three.
 *
 * Naming rules it encodes: the module comes first, `Admin` is the single administrative verb (every
 * capability of the module that no specific permission already covers) and is therefore absent from
 * a module that is fully split like `recording`, the verb always precedes the object, and the keys
 * stay flat — never nested per module.
 *
 * The legacy keys keep working —accepted on input, available on output— until they are **removed in
 * 3.12.0**.
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
} as const satisfies Readonly<Record<keyof MeetRoomMemberPermissions, readonly string[]>>;

/**
 * A legacy (`can*`) permission key, deprecated in favour of its canonical replacement(s).
 */
export type MeetLegacyPermissionKey = keyof typeof MEET_PERMISSION_ALIASES;

/**
 * A canonical `moduleAbility` permission key.
 */
export type MeetPermissionKey = (typeof MEET_PERMISSION_ALIASES)[MeetLegacyPermissionKey][number];

/**
 * Every legacy permission key, in the order they are documented.
 */
export const MEET_LEGACY_PERMISSION_KEYS = Object.keys(
	MEET_PERMISSION_ALIASES
) as readonly MeetLegacyPermissionKey[];

// Flattens the alias groups. Written with `concat` because this package targets `lib: es2017`, where
// `Array.prototype.flat` does not exist yet.
function flattenPermissionAliases(): readonly MeetPermissionKey[] {
	let flattened: MeetPermissionKey[] = [];

	for (const canonicalKeys of Object.values(MEET_PERMISSION_ALIASES)) {
		flattened = flattened.concat(canonicalKeys as readonly MeetPermissionKey[]);
	}

	return flattened;
}

/**
 * Every canonical permission key, in the order they are documented.
 */
export const MEET_PERMISSION_KEYS = flattenPermissionAliases();

// Inverts MEET_PERMISSION_ALIASES. Written as a loop because this package targets `lib: es2017`,
// where `Object.fromEntries` does not exist yet. Many-to-one: the three recording retrieval keys all
// point back at `canRetrieveRecordings`.
function invertPermissionAliases(): Record<MeetPermissionKey, MeetLegacyPermissionKey> {
	const inverted = {} as Record<MeetPermissionKey, MeetLegacyPermissionKey>;

	for (const [legacyKey, canonicalKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		for (const canonicalKey of canonicalKeys as readonly MeetPermissionKey[]) {
			inverted[canonicalKey] = legacyKey as MeetLegacyPermissionKey;
		}
	}

	return inverted;
}

/**
 * Reverse of {@link MEET_PERMISSION_ALIASES}: canonical key → the legacy key it came from. Several
 * canonical keys can share one legacy key (the recording retrieval split).
 */
export const MEET_CANONICAL_PERMISSION_KEYS: Readonly<Record<MeetPermissionKey, MeetLegacyPermissionKey>> =
	Object.freeze(invertPermissionAliases());

/**
 * A permission object as it arrives from an untrusted source (an HTTP body, a decoded token), where
 * legacy and canonical keys may be mixed and values are not yet validated.
 */
export type MeetPermissionsInput = Readonly<Record<string, unknown>>;

/**
 * A permission alias pair present in the same input with **conflicting** values.
 */
export interface MeetPermissionAliasConflict {
	/** The legacy key that was supplied. */
	legacyKey: MeetLegacyPermissionKey;
	/** The canonical key that was supplied alongside it. */
	canonicalKey: MeetPermissionKey;
	/** Value supplied under the legacy key. */
	legacyValue: boolean;
	/** Value supplied under the canonical key. */
	canonicalValue: boolean;
}

/**
 * Rewrites a permission object to canonical keys, dropping anything that is neither a known key nor a
 * boolean. Legacy keys are applied first, so an explicit canonical key always wins over its alias —
 * callers that must reject a contradiction should run {@link findPermissionAliasConflicts} first.
 *
 * @param input - A permission object with legacy keys, canonical keys, or a mix of both
 * @returns The same permissions keyed canonically
 */
export function normalizePermissions(input: MeetPermissionsInput): Partial<Record<MeetPermissionKey, boolean>> {
	const normalized: Partial<Record<MeetPermissionKey, boolean>> = {};

	for (const [legacyKey, canonicalKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		const value = input[legacyKey];

		if (typeof value === 'boolean') {
			// A split alias grants (or denies) its whole group: `canRetrieveRecordings: true` means
			// list + play + download, which is exactly what that flag allowed before the split.
			for (const canonicalKey of canonicalKeys as readonly MeetPermissionKey[]) {
				normalized[canonicalKey] = value;
			}
		}
	}

	for (const canonicalKey of MEET_PERMISSION_KEYS) {
		const value = input[canonicalKey];

		if (typeof value === 'boolean') {
			normalized[canonicalKey] = value;
		}
	}

	return normalized;
}

/**
 * Rewrites a canonically-keyed permission object back to the legacy key names, for clients that have
 * not migrated yet. Keys with no boolean value are omitted.
 *
 * A **split** alias collapses with AND: `canRetrieveRecordings` is true only when list, play and
 * download are all granted, and is omitted when any of the three is missing from the input. The old
 * flag cannot express "play but not download", so the conservative reading is the safe one — an old
 * client then hides the feature instead of offering a button that would be rejected with a 403.
 *
 * @param permissions - Permissions keyed canonically
 * @returns The same permissions keyed with the deprecated `can*` names
 */
export function toLegacyPermissions(
	permissions: Readonly<Partial<Record<MeetPermissionKey, boolean>>>
): Partial<Record<MeetLegacyPermissionKey, boolean>> {
	const legacy: Partial<Record<MeetLegacyPermissionKey, boolean>> = {};

	for (const [legacyKey, canonicalKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		let collapsed: boolean | undefined = true;

		for (const canonicalKey of canonicalKeys as readonly MeetPermissionKey[]) {
			const value = permissions[canonicalKey];

			if (typeof value !== 'boolean') {
				collapsed = undefined;
				break;
			}

			collapsed = collapsed && value;
		}

		if (typeof collapsed === 'boolean') {
			legacy[legacyKey as MeetLegacyPermissionKey] = collapsed;
		}
	}

	return legacy;
}

/**
 * Finds alias keys supplied together with a canonical replacement that contradicts them. An empty
 * array means the input is unambiguous and safe to {@link normalizePermissions}.
 *
 * A split alias is checked against **every** key of its group, so
 * `{ canRetrieveRecordings: true, recordingDownload: false }` is reported: the caller is asking for
 * two different things at once and the request should be rejected rather than silently resolved.
 *
 * @param input - A permission object with legacy keys, canonical keys, or a mix of both
 * @returns One entry per contradicting pair
 */
export function findPermissionAliasConflicts(input: MeetPermissionsInput): MeetPermissionAliasConflict[] {
	const conflicts: MeetPermissionAliasConflict[] = [];

	for (const [legacyKey, canonicalKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		const legacyValue = input[legacyKey];

		if (typeof legacyValue !== 'boolean') {
			continue;
		}

		for (const canonicalKey of canonicalKeys as readonly MeetPermissionKey[]) {
			const canonicalValue = input[canonicalKey];

			if (typeof canonicalValue === 'boolean' && canonicalValue !== legacyValue) {
				conflicts.push({
					legacyKey: legacyKey as MeetLegacyPermissionKey,
					canonicalKey,
					legacyValue,
					canonicalValue
				});
			}
		}
	}

	return conflicts;
}
