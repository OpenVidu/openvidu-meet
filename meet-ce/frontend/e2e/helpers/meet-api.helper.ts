// ---------------------------------------------------------------------------
// Domain types mirroring the Meet REST API contracts
// ---------------------------------------------------------------------------

export interface E2ERoom {
	roomId: string;
	roomName: string;
}

export interface E2ERoomMember {
	memberId: string;
	roomId: string;
	name: string;
	accessUrl: string;
}

export interface CaptionsGlobalConfig {
	enabled: boolean;
}

/** All per-participant permissions exposed by the Meet API. */
export interface E2ERoomMemberPermissions {
	canRecord: boolean;
	canRetrieveRecordings: boolean;
	canDeleteRecordings: boolean;
	canJoinMeeting: boolean;
	canShareAccessLinks: boolean;
	canMakeModerator: boolean;
	canKickParticipants: boolean;
	canEndMeeting: boolean;
	canPublishVideo: boolean;
	canPublishAudio: boolean;
	canShareScreen: boolean;
	canReadChat: boolean;
	canWriteChat: boolean;
	canChangeVirtualBackground: boolean;
}

/** Room feature configuration (all optional – missing fields use server defaults). */
export interface E2ERoomConfig {
	chat?: { enabled: boolean };
	recording?: {
		enabled: boolean;
		layout?: 'grid' | 'speaker' | 'custom';
		encoding?: string | object;
	};
	virtualBackground?: { enabled: boolean };
	e2ee?: { enabled: boolean };
	captions?: { enabled: boolean };
}

/** Per-role permission overrides applied at room creation time. */
export interface E2ERolesConfig {
	moderator?: { permissions: Partial<E2ERoomMemberPermissions> };
	speaker?: { permissions: Partial<E2ERoomMemberPermissions> };
}

/** Anonymous / registered access configuration for a room. */
export interface E2EAccessConfig {
	anonymous?: {
		moderator?: { enabled: boolean };
		speaker?: { enabled: boolean };
		recording?: { enabled: boolean };
	};
	registered?: { enabled: boolean };
}

// ---------------------------------------------------------------------------
// Options objects for the API helper functions
// ---------------------------------------------------------------------------

export interface CreateRoomOptions {
	roomName?: string;
	config?: Partial<E2ERoomConfig>;
	roles?: E2ERolesConfig;
	access?: E2EAccessConfig;
	autoDeletionDate?: number;
}

export interface CreateRoomMemberOptions {
	roomId: string;
	/** Display name for an external (anonymous) member. Mutually exclusive with userId. */
	name: string;
	/** Base role that determines the default permission set. Defaults to 'moderator'. */
	baseRole?: 'speaker' | 'moderator';
	/** Optional fine-grained permission overrides on top of the base role. */
	customPermissions?: Partial<E2ERoomMemberPermissions>;
}

export interface CreateRoomAndGetAccessUrlOptions {
	roomName?: string;
	participantName?: string;
	/** Base role for the created member. Defaults to 'moderator'. */
	memberRole?: 'speaker' | 'moderator';
	/** Fine-grained permission overrides for the created member. */
	memberPermissions?: Partial<E2ERoomMemberPermissions>;
	/** Room-level feature configuration. */
	roomConfig?: Partial<E2ERoomConfig>;
	/** Per-role permission overrides at the room level. */
	roomRoles?: E2ERolesConfig;
	/** Anonymous / registered access settings for the room. */
	roomAccess?: E2EAccessConfig;
	/** URL query parameters appended to the member access URL. */
	queryParams?: Record<string, string>;
	/** Set that collects created room IDs for afterAll cleanup. */
	createdRoomIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Internal API types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Environment / URL helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API helpers
// ---------------------------------------------------------------------------

/** Creates a room with the given options. All fields are optional; the server applies defaults. */
export async function createRoom(options: CreateRoomOptions = {}): Promise<E2ERoom> {
	const body: Record<string, unknown> = {
		roomName: options.roomName || `pw-room-${Date.now()}`
	};

	if (options.config) {
		body['config'] = options.config;
	}

	if (options.roles) {
		body['roles'] = options.roles;
	}

	if (options.access) {
		body['access'] = options.access;
	}

	if (options.autoDeletionDate !== undefined) {
		body['autoDeletionDate'] = options.autoDeletionDate;
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
	return { roomId: data.roomId, roomName: data.roomName };
}

/** Creates an external (named) room member, optionally with custom per-permission overrides. */
export async function createRoomMember(params: CreateRoomMemberOptions): Promise<E2ERoomMember> {
	const body: Record<string, unknown> = {
		name: params.name,
		baseRole: params.baseRole ?? 'moderator'
	};

	if (params.customPermissions) {
		body['customPermissions'] = params.customPermissions;
	}

	const response = await fetch(withApiPath(`/rooms/${encodeURIComponent(params.roomId)}/members`), {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': API_KEY
		},
		body: JSON.stringify(body)
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

/**
 * Backward-compatible alias for {@link createRoomMember}.
 * @deprecated Use `createRoomMember` instead.
 */
export const createExternalRoomMember = createRoomMember;

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

export async function deleteRooms(roomIds: Iterable<string>): Promise<void> {
	const ids = Array.from(roomIds).filter((roomId) => roomId.trim().length > 0);

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
}

export function toAbsoluteMeetUrl(accessUrl: string): string {
	if (accessUrl.startsWith('http://') || accessUrl.startsWith('https://')) {
		return new URL(accessUrl).toString();
	}

	const meetBaseUrl = new URL(MEET_BASE_URL);
	const basePath = meetBaseUrl.pathname.replace(/\/$/, '');
	const normalizedAccessPath = accessUrl.startsWith('/') ? `${basePath}${accessUrl}` : `${basePath}/${accessUrl}`;
	return new URL(normalizedAccessPath, meetBaseUrl.origin).toString();
}

/**
 * Convenience helper that creates a room, adds one member, and returns the
 * member's fully-qualified access URL.
 *
 * All options are optional. Uses sensible defaults (moderator role, auto-generated names).
 */
export async function createRoomAndGetAccessUrl(
	options: CreateRoomAndGetAccessUrlOptions = {}
): Promise<{ room: E2ERoom; member: E2ERoomMember; accessUrl: string }> {
	const {
		roomName,
		participantName,
		memberRole = 'moderator',
		memberPermissions,
		roomConfig,
		roomRoles,
		roomAccess,
		queryParams,
		createdRoomIds
	} = options;

	const room = await createRoom({
		roomName,
		config: roomConfig,
		roles: roomRoles,
		access: roomAccess
	});

	createdRoomIds?.add(room.roomId);

	const member = await createRoomMember({
		roomId: room.roomId,
		name: participantName ?? `member-${Date.now()}`,
		baseRole: memberRole,
		customPermissions: memberPermissions
	});

	const accessUrl = new URL(toAbsoluteMeetUrl(member.accessUrl));

	for (const [key, value] of Object.entries(queryParams ?? {})) {
		accessUrl.searchParams.set(key, value);
	}

	return { room, member, accessUrl: accessUrl.toString() };
}
