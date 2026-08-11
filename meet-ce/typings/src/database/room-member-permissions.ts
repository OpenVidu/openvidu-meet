/**
 * List of permissions for a room member, keyed with the canonical `moduleAbility` scheme (module
 * first, no `can` prefix). This is the shape the API accepts and stores; during the deprecation
 * window the legacy `can*` spellings ({@link MeetRoomMemberLegacyPermissions}) are still accepted on
 * input and are the default naming on output — see {@link MEET_PERMISSION_ALIASES} for the mapping.
 *
 * `canRetrieveRecordings` was **split into three** keys (`recordingList`, `recordingPlay`,
 * `recordingDownload`): enumerating recordings, playing one and downloading a copy are different
 * capabilities. Granting the legacy flag grants the whole group.
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
 * The deprecated `can*` spellings of {@link MeetRoomMemberPermissions}. Requests may still use these
 * keys (they are normalized through {@link MEET_PERMISSION_ALIASES}) and responses serve them by
 * default during the deprecation window.
 *
 * @deprecated Use the canonical keys of {@link MeetRoomMemberPermissions}. Removed in 3.12.0.
 */
export interface MeetRoomMemberLegacyPermissions {
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
} as const satisfies Readonly<
	Record<keyof MeetRoomMemberLegacyPermissions, readonly (keyof MeetRoomMemberPermissions)[]>
>;

/**
 * A legacy (`can*`) permission key, deprecated in favour of its canonical replacement(s).
 */
export type MeetLegacyPermissionKey = keyof typeof MEET_PERMISSION_ALIASES;

/**
 * A canonical `moduleAbility` permission key.
 */
export type MeetPermissionKey = (typeof MEET_PERMISSION_ALIASES)[MeetLegacyPermissionKey][number];

// Compile-time guard: every canonical key declared on the interface must be reachable through the
// alias map (the reverse direction — map values being valid keys — is enforced by the `satisfies`
// clause above). If a new permission is ever added to the interface without an alias entry, the
// constraint below is violated and this file stops compiling, forcing the author to decide how the
// legacy surface represents the new key.
type _RequireTrue<T extends true> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AssertAliasMapCoversPermissions = _RequireTrue<
	Exclude<keyof MeetRoomMemberPermissions, MeetPermissionKey> extends never ? true : false
>;

/**
 * Every legacy permission key, in the order they are documented.
 *
 * Removed in **3.12.0** together with the legacy aliases. Not tagged `@deprecated` on purpose: the
 * backend enforces `no-deprecated` as an error and every deprecation-window code path (request
 * normalization, legacy response serialization, the schema migrations) legitimately calls the alias
 * helpers until the window closes.
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
 *
 * Removed in **3.12.0** together with the legacy aliases.
 */
export const MEET_CANONICAL_PERMISSION_KEYS: Readonly<Record<MeetPermissionKey, MeetLegacyPermissionKey>> =
	Object.freeze(invertPermissionAliases());

/**
 * A permission object as it arrives from an untrusted source (an HTTP body, a decoded token), where
 * legacy and canonical keys may be mixed and values are not yet validated. Objects already typed as
 * {@link MeetRoomMemberPermissions} are accepted too, so migration/normalization call sites can pass
 * typed values whose runtime keys may still be legacy (a lean Mongo document, a cached token).
 */
export type MeetPermissionsInput = Readonly<Record<string, unknown>> | Readonly<Partial<MeetRoomMemberPermissions>>;

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
	const record = input as Readonly<Record<string, unknown>>;
	const normalized: Partial<Record<MeetPermissionKey, boolean>> = {};

	for (const [legacyKey, canonicalKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		const value = record[legacyKey];

		if (typeof value === 'boolean') {
			// A split alias grants (or denies) its whole group: `canRetrieveRecordings: true` means
			// list + play + download, which is exactly what that flag allowed before the split.
			for (const canonicalKey of canonicalKeys as readonly MeetPermissionKey[]) {
				normalized[canonicalKey] = value;
			}
		}
	}

	for (const canonicalKey of MEET_PERMISSION_KEYS) {
		const value = record[canonicalKey];

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
 * Removed in **3.12.0** together with the legacy aliases (see {@link MEET_LEGACY_PERMISSION_KEYS}
 * for why it is not tagged `@deprecated`).
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
 * Removed in **3.12.0** together with the legacy aliases.
 *
 * @param input - A permission object with legacy keys, canonical keys, or a mix of both
 * @returns One entry per contradicting pair
 */
export function findPermissionAliasConflicts(input: MeetPermissionsInput): MeetPermissionAliasConflict[] {
	const record = input as Readonly<Record<string, unknown>>;
	const conflicts: MeetPermissionAliasConflict[] = [];

	for (const [legacyKey, canonicalKeys] of Object.entries(MEET_PERMISSION_ALIASES)) {
		const legacyValue = record[legacyKey];

		if (typeof legacyValue !== 'boolean') {
			continue;
		}

		for (const canonicalKey of canonicalKeys as readonly MeetPermissionKey[]) {
			const canonicalValue = record[canonicalKey];

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
