import {
	MeetRoom,
	MeetRoomMember,
	MeetRoomMemberOptions,
	MeetRoomMemberRole,
	MeetRoomOptions
} from '@openvidu-meet/typings';

// ---------------------------------------------------------------------------
// Environment / URL helpers
// ---------------------------------------------------------------------------

const buildDefaultApiBaseUrl = (meetBaseUrl: string, internal = false): string => {
	const base = new URL(meetBaseUrl);
	const normalizedPath = base.pathname.replace(/\/$/, '');
	base.pathname = internal ? `${normalizedPath}/internal-api/v1` : `${normalizedPath}/api/v1`;
	return base.toString().replace(/\/$/, '');
};

const MEET_BASE_URL = process.env['E2E_BASE_URL'] || 'http://localhost:6080/meet';
const API_BASE_URL = process.env['E2E_API_BASE_URL'] || buildDefaultApiBaseUrl(MEET_BASE_URL);
const INTERNAL_API_BASE_URL = process.env['E2E_INTERNAL_API_BASE_URL'] || buildDefaultApiBaseUrl(MEET_BASE_URL, true);
const API_KEY = process.env['E2E_API_KEY'] || 'meet-api-key';

const withApiPath = (path: string): string => {
	return `${API_BASE_URL}${path}`;
};

const assertOk = (response: Response, responseText: string, operation: string): void => {
	if (!response.ok) {
		throw new Error(`Meet API request failed (${operation}) with status ${response.status}: ${responseText}`);
	}
};

// ---------------------------------------------------------------------------
// Public API helpers
// ---------------------------------------------------------------------------

/**
 * Fetches the global captions configuration.
 */
export const getCaptionsGlobalConfig = async (): Promise<{
	enabled: boolean;
}> => {
	const response = await fetch(`${INTERNAL_API_BASE_URL}/config/captions`, {
		method: 'GET',
		headers: {
			'x-api-key': API_KEY
		}
	});

	const responseText = await response.text();
	assertOk(response, responseText, 'get captions global config');

	return JSON.parse(responseText) as { enabled: boolean };
};

/**
 * Creates a room with the given options.
 */
export const createRoom = async (options: MeetRoomOptions = {}): Promise<MeetRoom> => {
	const response = await fetch(withApiPath('/rooms'), {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': API_KEY
		},
		body: JSON.stringify(options)
	});

	const responseText = await response.text();
	assertOk(response, responseText, 'create room');

	return JSON.parse(responseText) as MeetRoom;
};

/**
 * Adds a member to the specified room with the given options.
 */
export const createRoomMember = async (roomId: string, options: MeetRoomMemberOptions): Promise<MeetRoomMember> => {
	const response = await fetch(withApiPath(`/rooms/${encodeURIComponent(roomId)}/members`), {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': API_KEY
		},
		body: JSON.stringify(options)
	});

	const responseText = await response.text();
	assertOk(response, responseText, 'create room member');

	return JSON.parse(responseText) as MeetRoomMember;
};

/**
 * Convenience helper that creates a room, adds one member, and returns the
 * member's fully-qualified access URL.
 */
export const createRoomAndGetAnonymousAccessUrl = async (
	roomOptions: MeetRoomOptions = {},
	accessUrlType: 'moderator' | 'speaker' = 'moderator',
	queryParams?: Record<string, string>
): Promise<{ room: MeetRoom; accessUrl: string }> => {
	const room = await createRoom(roomOptions);
	const accessUrl = new URL(room.access.anonymous[accessUrlType].url);

	for (const [key, value] of Object.entries(queryParams ?? {})) {
		accessUrl.searchParams.set(key, value);
	}

	return { room, accessUrl: accessUrl.toString() };
};

/**
 * Convenience helper that creates a room, adds one member, and returns the
 * member's fully-qualified access URL.
 */
export const createRoomAndGetMemberAccessUrl = async (
	roomOptions: MeetRoomOptions = {},
	memberOptions: MeetRoomMemberOptions = {
		name: `member-${Date.now()}`,
		baseRole: MeetRoomMemberRole.MODERATOR
	},
	queryParams?: Record<string, string>
): Promise<{ room: MeetRoom; member: MeetRoomMember; accessUrl: string }> => {
	const room = await createRoom(roomOptions);
	const member = await createRoomMember(room.roomId, memberOptions);

	const accessUrl = new URL(member.accessUrl);

	for (const [key, value] of Object.entries(queryParams ?? {})) {
		accessUrl.searchParams.set(key, value);
	}

	return { room, member, accessUrl: accessUrl.toString() };
};

/**
 * Deletes the specified rooms.
 */
export const deleteRooms = async (roomIds: string[]): Promise<void> => {
	const ids = roomIds.filter((roomId) => roomId.trim().length > 0);

	if (ids.length === 0) {
		return;
	}

	const response = await fetch(
		withApiPath(`/rooms?roomIds=${ids.map(encodeURIComponent).join(',')}&withMeeting=force&withRecordings=force`),
		{
			method: 'DELETE',
			headers: {
				'x-api-key': API_KEY
			}
		}
	);

	const responseText = await response.text();
	assertOk(response, responseText, `delete rooms ${ids.join(',')}`);
};
