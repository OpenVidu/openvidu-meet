import { MeetRecordingInfo, MeetRoom, MeetRoomOptions } from '@openvidu-meet/typings';
import { MEET_API_KEY, MEET_API_URL } from '../config';

// ─── Internal helpers ───────────────────────────────────────────────────────

const withApiPath = (path: string): string => `${MEET_API_URL}/api/v1${path}`;

const assertOk = (response: Response, responseText: string, operation: string): void => {
	if (!response.ok) {
		throw new Error(`Meet API request failed (${operation}) with status ${response.status}: ${responseText}`);
	}
};

// ─── Room operations ────────────────────────────────────────────────────────

/**
 * Creates a room via the Meet API.
 *
 * @returns The newly created room.
 */
export const createRoom = async (options: MeetRoomOptions = {}): Promise<MeetRoom> => {
	const response = await fetch(withApiPath('/rooms'), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': MEET_API_KEY
		},
		body: JSON.stringify(options)
	});

	const responseText = await response.text();
	assertOk(response, responseText, 'create room');

	return JSON.parse(responseText) as MeetRoom;
};

/**
 * Fetches a room's details from the Meet API.
 */
export const getRoom = async (roomId: string): Promise<MeetRoom> => {
	const response = await fetch(withApiPath(`/rooms/${roomId}?extraFields=config`), {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': MEET_API_KEY
		}
	});

	const responseText = await response.text();
	assertOk(response, responseText, 'get room');

	const room = JSON.parse(responseText) as MeetRoom & { _extraFields?: string };
	delete room._extraFields;
	return room;
};

/**
 * Deletes the specified rooms via the Meet API.
 */
export const deleteRooms = async (roomIds: string[]): Promise<void> => {
	const ids = roomIds.filter((id) => id.trim().length > 0);
	if (ids.length === 0) return;

	const response = await fetch(
		withApiPath(`/rooms?roomIds=${ids.map(encodeURIComponent).join(',')}&withMeeting=force&withRecordings=force`),
		{
			method: 'DELETE',
			headers: { 'x-api-key': MEET_API_KEY }
		}
	);

	const responseText = await response.text();
	assertOk(response, responseText, `delete rooms ${ids.join(',')}`);
};

// ─── Recording operations ──────────────────────────────────────────────────────

/**
 * Fetches a recording's details from the Meet API.
 */
export const getRecording = async (recordingId: string): Promise<MeetRecordingInfo> => {
	const response = await fetch(withApiPath(`/recordings/${recordingId}`), {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': MEET_API_KEY
		}
	});

	const responseText = await response.text();
	assertOk(response, responseText, 'get recording');

	return JSON.parse(responseText) as MeetRecordingInfo;
};

/**
 * Fetches the shareable URL for a recording from the Meet API.
 *
 * The returned URL points to the recording player page (`/recording/:id?...`)
 * and is suitable to be passed as the `recording-url` attribute of the
 * `<openvidu-meet>` web component.
 */
export const getRecordingUrl = async (recordingId: string): Promise<string> => {
	const response = await fetch(withApiPath(`/recordings/${recordingId}/url`), {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': MEET_API_KEY
		}
	});

	const responseText = await response.text();
	assertOk(response, responseText, 'get recording url');

	return (JSON.parse(responseText) as { url: string }).url;
};

/**
 * Lists recordings filtered by `roomId` via the Meet API.
 */
export const listRecordingsByRoomId = async (roomId: string): Promise<MeetRecordingInfo[]> => {
	const response = await fetch(withApiPath(`/recordings?roomId=${encodeURIComponent(roomId)}`), {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': MEET_API_KEY
		}
	});

	const responseText = await response.text();
	assertOk(response, responseText, 'list recordings');

	return (JSON.parse(responseText) as { recordings: MeetRecordingInfo[] }).recordings;
};
