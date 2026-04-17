export interface E2ERoom {
	roomId: string;
	roomName: string;
}

interface E2ERoomConfig {
	captions?: {
		enabled: boolean;
	};
}

export interface CaptionsGlobalConfig {
	enabled: boolean;
}

export interface E2ERoomMember {
	memberId: string;
	roomId: string;
	name: string;
	accessUrl: string;
}

interface CreateRoomResponse {
	roomId: string;
	roomName: string;
}

interface CreateRoomMemberResponse {
	memberId: string;
	roomId: string;
	name: string;
	accessUrl: string;
}

const MEET_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:6080/meet';
const API_BASE_URL = process.env.E2E_API_BASE_URL || buildDefaultApiBaseUrl(MEET_BASE_URL);
const INTERNAL_API_BASE_URL = process.env.E2E_INTERNAL_API_BASE_URL || buildDefaultInternalApiBaseUrl(MEET_BASE_URL);
const API_KEY = process.env.E2E_API_KEY || 'meet-api-key';

function buildDefaultApiBaseUrl(meetBaseUrl: string): string {
	const base = new URL(meetBaseUrl);
	const normalizedPath = base.pathname.replace(/\/$/, '');
	base.pathname = `${normalizedPath}/api/v1`;
	return base.toString().replace(/\/$/, '');
}

function buildDefaultInternalApiBaseUrl(meetBaseUrl: string): string {
	const base = new URL(meetBaseUrl);
	const normalizedPath = base.pathname.replace(/\/$/, '');
	base.pathname = `${normalizedPath}/internal-api/v1`;
	return base.toString().replace(/\/$/, '');
}

function withApiPath(path: string): string {
	return `${API_BASE_URL}${path}`;
}

function assertOk(response: Response, responseText: string, operation: string): void {
	if (!response.ok) {
		throw new Error(`Meet API request failed (${operation}) with status ${response.status}: ${responseText}`);
	}
}

export async function createRoom(options: { roomName?: string; config?: E2ERoomConfig } = {}): Promise<E2ERoom> {
	const body: {
		roomName: string;
		config?: E2ERoomConfig;
	} = {
		roomName: options.roomName || `pw-room-${Date.now()}`
	};

	if (options.config) {
		body.config = options.config;
	}

	const response = await fetch(withApiPath('/rooms'), {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': API_KEY
		},
		body: JSON.stringify(body)
	});

	const responseText = await response.text();
	assertOk(response, responseText, 'create room');

	const data = JSON.parse(responseText) as CreateRoomResponse;
	return {
		roomId: data.roomId,
		roomName: data.roomName
	};
}

export async function getCaptionsGlobalConfig(): Promise<CaptionsGlobalConfig> {
	const response = await fetch(`${INTERNAL_API_BASE_URL}/config/captions`, {
		method: 'GET',
		headers: {
			'x-api-key': API_KEY
		}
	});

	const responseText = await response.text();
	assertOk(response, responseText, 'get captions global config');

	return JSON.parse(responseText) as CaptionsGlobalConfig;
}

export async function createExternalRoomMember(params: {
	roomId: string;
	name: string;
	baseRole?: 'speaker' | 'moderator';
}): Promise<E2ERoomMember> {
	const response = await fetch(withApiPath(`/rooms/${encodeURIComponent(params.roomId)}/members`), {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': API_KEY
		},
		body: JSON.stringify({
			name: params.name,
			baseRole: params.baseRole || 'speaker'
		})
	});

	const responseText = await response.text();
	assertOk(response, responseText, 'create room member');

	const data = JSON.parse(responseText) as CreateRoomMemberResponse;
	return {
		memberId: data.memberId,
		roomId: data.roomId,
		name: data.name,
		accessUrl: data.accessUrl
	};
}

export async function deleteRoom(roomId: string): Promise<void> {
	const response = await fetch(
		withApiPath(`/rooms/${encodeURIComponent(roomId)}?withMeeting=force&withRecordings=force`),
		{
			method: 'DELETE',
			headers: {
				'x-api-key': API_KEY
			}
		}
	);

	if (response.status === 404) {
		return;
	}

	const responseText = await response.text();
	assertOk(response, responseText, `delete room ${roomId}`);
}

export async function deleteRooms(roomIds: Iterable<string>): Promise<void> {
	await Promise.all(Array.from(roomIds).map((roomId) => deleteRoom(roomId)));
}

export function toAbsoluteMeetUrl(accessUrl: string): string {
	if (accessUrl.startsWith('http://') || accessUrl.startsWith('https://')) {
		const absoluteUrl = new URL(accessUrl);
		return absoluteUrl.toString();
	}

	const meetBaseUrl = new URL(MEET_BASE_URL);
	const basePath = meetBaseUrl.pathname.replace(/\/$/, '');
	const normalizedAccessPath = accessUrl.startsWith('/') ? `${basePath}${accessUrl}` : `${basePath}/${accessUrl}`;
	const url = new URL(normalizedAccessPath, meetBaseUrl.origin);

	return url.toString();
}

export async function createRoomAndGetAccessUrl(
	participantName: string,
	room?: E2ERoom
): Promise<{ room: E2ERoom; accessUrl: string }> {
	const createdRoom = room || (await createRoom({ roomName: `chat-pw-${Date.now()}` }));
	const member = await createExternalRoomMember({
		roomId: createdRoom.roomId,
		name: participantName,
		baseRole: 'moderator'
	});

	return {
		room: createdRoom,
		accessUrl: toAbsoluteMeetUrl(member.accessUrl)
	};
}
