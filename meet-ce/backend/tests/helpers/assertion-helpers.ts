import { expect } from '@jest/globals';
import {
	LiveKitPermissions,
	MeetingEndAction,
	MeetRecordingEncodingOptions,
	MeetRecordingEncodingPreset,
	MeetRecordingInfo,
	MeetRecordingLayout,
	MeetRecordingStatus,
	MeetRoom,
	MeetRoomAutoDeletionPolicy,
	MeetRoomConfig,
	MeetRoomMemberPermissions,
	MeetRoomMemberUIBadge,
	MeetRoomStatus,
	normalizePermissions,
	toDeprecatedPermissions,
	TrackSource
} from '@openvidu-meet/typings';
import { Response } from 'supertest';
import { container } from '../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../src/config/internal-config.js';
import { MEET_ENV } from '../../src/environment.js';
import type { OpenViduMeetError } from '../../src/models/error.model.js';
import { TokenService } from '../../src/services/token.service.js';
import { getFullPath } from './request-helpers.js';

export const DEFAULT_RECORDING_ENCODING_PRESET = MeetRecordingEncodingPreset.H264_720P_30;
export const DEFAULT_RECORDING_LAYOUT = MeetRecordingLayout.GRID;

/**
 * The wire shape of a permission object in compatibility mode (the default the suites run under):
 * the current keys plus the deprecated `can*` spellings derived from them. Use it to compare an
 * API response against an expected current-keys object; token metadata and stored documents carry
 * only the current keys and need no wrapping. Removed in 3.12.0 with the compatibility mode.
 */
export const wirePermissions = (permissions: Readonly<Partial<MeetRoomMemberPermissions>>) => ({
	...permissions,
	...toDeprecatedPermissions(permissions)
});

/**
 * Asserts a rejection against the very factory the backend was expected to throw. The backend has 4
 * distinct 401 factories and 5 distinct 403 ones, so a status code alone does not tell a rejection
 * for the right reason from one for the wrong reason.
 */
export const expectMeetError = (response: Response, expected: OpenViduMeetError) => {
	expect(response.status).toBe(expected.statusCode);
	expect(response.body).toEqual({ error: expected.name, message: expected.message });
};

export const expectErrorResponse = (
	response: Response,
	status = 422,
	error = 'Unprocessable Entity',
	message = 'Invalid request',
	details?: Array<{ field?: string; message: string }>
) => {
	expect(response.status).toBe(status);
	expect(response.body).toMatchObject({ error, message });

	if (details === undefined) {
		expect(response.body.details).toBeUndefined();
		return;
	}

	expect(Array.isArray(response.body.details)).toBe(true);
	expect(response.body.details).toEqual(
		expect.arrayContaining(
			details.map((d) => {
				const matcher: any = { message: expect.stringContaining(d.message) };

				if (d.field !== undefined) {
					matcher.field = d.field;
				}

				return expect.objectContaining(matcher);
			})
		)
	);
};

export const expectValidationError = (response: Response, field: string, message: string) => {
	expectErrorResponse(response, 422, 'Unprocessable Entity', 'Invalid request', [{ field, message }]);
};

/**
 * Asserts a per-item rejection from a bulk endpoint: 400, the resource listed under `failed` with
 * the expected reason, absent from `deleted`, and still readable afterwards. The read-back is the
 * point — an endpoint that deletes the resource and then reports it as failed satisfies a
 * status-only assertion.
 *
 * `failed` entries are not shaped alike across endpoints (rooms split the reason into
 * `error`/`message`, recordings collapse it into `error`), so the reason is matched against the
 * entry's values instead of a fixed field.
 */
export const expectBulkDenied = async (
	response: Response,
	denied: { id: string; reason: OpenViduMeetError; readBack: () => Promise<Response> }
) => {
	const { id, reason, readBack } = denied;

	expect(response.status).toBe(400);
	expect(JSON.stringify(response.body.deleted ?? [])).not.toContain(id);

	const failed = (response.body.failed ?? []) as Record<string, string>[];
	const entry = failed.find((item) => Object.values(item).includes(id));

	if (!entry) {
		throw new Error(`Bulk response did not list '${id}' as failed: ${JSON.stringify(response.body)}`);
	}

	expect(Object.values(entry)).toContain(reason.message);
	expect((await readBack()).status).toBe(200);
};

/**
 * Asserts that a rooms response matches the expected values for testing purposes.
 * Validates the room array length and pagination properties.
 *
 * @param body - The API response body to validate
 * @param expectedRoomLength - The expected number of rooms in the response
 * @param expectedMaxItems - The expected maximum number of items in pagination
 * @param expectedTruncated - The expected value for pagination.isTruncated flag
 * @param expectedNextPageToken - The expected presence of pagination.nextPageToken
 *                               (if true, expects nextPageToken to be defined;
 *                                if false, expects nextPageToken to be undefined)
 */
export const expectSuccessRoomsResponse = (
	response: Response,
	expectedRoomLength: number,
	expectedMaxItems: number,
	expectedTruncated: boolean,
	expectedNextPageToken: boolean
) => {
	const { body } = response;
	expect(response.status).toBe(200);
	expect(Array.isArray(body.rooms)).toBe(true);
	expect(body.rooms.length).toBe(expectedRoomLength);
	expect(body.pagination.isTruncated).toBe(expectedTruncated);

	expectedNextPageToken
		? expect(body.pagination.nextPageToken).toEqual(expect.stringMatching(/\S+/))
		: expect(body.pagination.nextPageToken).toBeUndefined();
	expect(body.pagination.maxItems).toBe(expectedMaxItems);
};

export const expectSuccessRoomResponse = (response: Response, roomName: string, expected: ExpectedRoom = {}) => {
	expect(response.status).toBe(200);
	expectValidRoom(response.body, roomName, expected);
};

export const expectSuccessRoomConfigResponse = (response: Response, config: MeetRoomConfig) => {
	expect(response.status).toBe(200);
	expect(response.body).toEqual(config);
};

export const expectExtraFieldsInResponse = (room: MeetRoom) => {
	expect((room as any)._extraFields).toEqual(['config', 'roles']);
};

/**
 * Expected values for a room, defaulting to what `POST /rooms` produces for a payload that only
 * carries a room name: anonymous access open for the three roles, user access closed, no auto
 * deletion, no config in the response and the initial admin as the owner.
 */
export type ExpectedRoom = {
	roomIdPrefix?: string;
	config?: MeetRoomConfig;
	autoDeletionDate?: number;
	autoDeletionPolicy?: MeetRoomAutoDeletionPolicy;
	status?: MeetRoomStatus;
	meetingEndAction?: MeetingEndAction;
	owner?: string;
	access?: {
		anonymous?: { moderator?: boolean; speaker?: boolean; recording?: boolean };
		user?: boolean;
	};
};

export const expectValidRoom = (room: MeetRoom, name: string, expected: ExpectedRoom = {}) => {
	const {
		roomIdPrefix,
		config,
		autoDeletionDate,
		autoDeletionPolicy,
		status = MeetRoomStatus.OPEN,
		meetingEndAction = MeetingEndAction.NONE,
		owner = MEET_ENV.INITIAL_ADMIN_USER,
		access = {}
	} = expected;

	expect(room.roomName).toBe(name);
	expect(room.roomId).toMatch(new RegExp(`^${roomIdPrefix ?? '[a-z0-9_]+'}-[0-9a-z]{15}$`));
	expect(room.owner).toBe(owner);
	expect(room.creationDate).toBeGreaterThan(0);
	expect(room.creationDate).toBeLessThanOrEqual(Date.now());

	if (autoDeletionDate === undefined) {
		expect(room.autoDeletionDate).toBeUndefined();
		expect(room.autoDeletionPolicy).toBeUndefined();
	} else {
		expect(room.autoDeletionDate).toBe(autoDeletionDate);
	}

	if (autoDeletionPolicy !== undefined) {
		expect(room.autoDeletionPolicy).toEqual(autoDeletionPolicy);
	}

	// toMatchObject so the encoding defaults the server fills in do not have to be spelled out
	if (config === undefined) {
		expect(room.config).toBeUndefined();
	} else {
		expect(room.config).toMatchObject(config as unknown as Record<string, unknown>);
	}

	expect(room.access.anonymous.moderator.enabled).toBe(access.anonymous?.moderator ?? true);
	expect(room.access.anonymous.speaker.enabled).toBe(access.anonymous?.speaker ?? true);
	expect(room.access.anonymous.recording.enabled).toBe(access.anonymous?.recording ?? true);
	expect(room.access.user.enabled).toBe(access.user ?? false);

	expectAnonymousAccessUrl(room.access.anonymous.moderator.url, `/room/${room.roomId}`);
	expectAnonymousAccessUrl(room.access.anonymous.speaker.url, `/room/${room.roomId}`);
	expectAnonymousAccessUrl(room.access.anonymous.recording.url, `/room/${room.roomId}/recordings`);

	const userUrl = new URL(room.access.user.url);
	expect(userUrl.pathname).toBe(getFullPath(`/room/${room.roomId}`));
	expect(userUrl.searchParams.get('secret')).toBeNull();

	expect(room.status).toEqual(status);
	expect(room.meetingEndAction).toEqual(meetingEndAction);
};

const expectAnonymousAccessUrl = (url: string, path: string) => {
	const parsedUrl = new URL(url);
	expect(parsedUrl.pathname).toBe(getFullPath(path));
	expect(parsedUrl.searchParams.get('secret')).toEqual(expect.stringMatching(/\S+/));
};

export const expectValidRecording = (
	recording: MeetRecordingInfo,
	recordingId: string,
	roomId: string,
	roomName: string,
	status: MeetRecordingStatus,
	expectedLayout: MeetRecordingLayout = DEFAULT_RECORDING_LAYOUT,
	expectedEncoding: MeetRecordingEncodingPreset | MeetRecordingEncodingOptions = DEFAULT_RECORDING_ENCODING_PRESET
) => {
	expect(recording.recordingId).toBe(recordingId);
	expect(recording.roomId).toBe(roomId);
	expect(recording.roomName).toBe(roomName);
	expect(recording.status).toBe(status);
	expect(recording.startDate).toBeGreaterThan(0);
	expect(recording.startDate).toBeLessThanOrEqual(Date.now());
	expect(recording.filename).toMatch(new RegExp(`^${roomId}--[0-9a-z]+\\.mp4$`));
	expect(typeof recording.details).toBe('string');
	expect(recording.layout).toBe(expectedLayout);

	if (typeof expectedEncoding === 'string') {
		expect(recording.encoding).toBe(expectedEncoding);
	} else {
		expect(recording.encoding).toMatchObject(expectedEncoding as unknown as Record<string, unknown>);
	}
};

export const expectValidRoomWithFields = (room: MeetRoom, fields: string[]) => {
	expectObjectFields(room, fields);
};

export const expectValidRecordingWithFields = (rec: MeetRecordingInfo, fields: string[]) => {
	expectObjectFields(rec, fields);
};

/**
 * Asserts that field filtering returned exactly the requested fields and nothing else.
 * `_extraFields` is response metadata every room endpoint appends, never a filtered field.
 */
const expectObjectFields = (obj: unknown, fields: string[]) => {
	expect(obj).toBeDefined();
	const keys = Object.keys(obj as object).filter((key) => key !== '_extraFields');
	expect(keys.sort()).toEqual([...fields].sort());
	fields.forEach((field) => expect((obj as Record<string, unknown>)[field]).not.toBeUndefined());
};

// Validate recording location header in the response
export const expectValidRecordingLocationHeader = (response: Response) => {
	const locationHeaderUrl = new URL(response.headers.location);
	expect(locationHeaderUrl.pathname).toBe(
		getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${response.body.recordingId}`)
	);
};

/**
 * Validates a successful recording media response, supporting edge cases and range requests.
 *
 * @param response - The HTTP response object to validate
 * @param range - Optional range header that was sent in the request
 * @param fullSize - Optional total file size for range validation
 * @param options - Optional configuration to handle edge cases:
 *   - allowSizeDifference: Allows a difference between content-length and actual body size (default: false)
 *   - ignoreRangeFormat: Ignores exact range format checking (useful for adjusted ranges) (default: false)
 *   - expectedStatus: Override the expected status code (default: auto-determined based on range)
 */
export const expectSuccessRecordingMediaResponse = (
	response: Response,
	range?: string,
	fullSize?: number,
	options?: {
		allowSizeDifference?: boolean;
		ignoreRangeFormat?: boolean;
		expectedStatus?: number;
	}
) => {
	// Default options
	const opts = {
		allowSizeDifference: false,
		ignoreRangeFormat: false,
		...options
	};

	// Determine expected status
	const expectedStatus = opts.expectedStatus ?? (range ? 206 : 200);

	// Basic validations for any successful response
	expect(response.status).toBe(expectedStatus);
	expect(response.headers['content-type']).toBe('video/mp4');
	expect(response.headers['accept-ranges']).toBe('bytes');
	expect(parseInt(response.headers['content-length'])).toBeGreaterThan(0);
	expect(response.headers['cache-control']).toBeDefined();

	// Verify response is binary data with some size
	expect(response.body).toBeInstanceOf(Buffer);
	expect(response.body.length).toBeGreaterThan(0);

	// Handle range responses (206 Partial Content)
	if (range && expectedStatus === 206) {
		// Verify the content-range header
		expect(response.headers['content-range']).toBeDefined();

		// If ignoreRangeFormat is true, only check the format of the content-range header
		if (opts.ignoreRangeFormat) {
			expect(response.headers['content-range']).toMatch(/^bytes \d+-\d+\/\d+$/);

			if (fullSize) {
				// Verify the total size in content-range header
				const totalSizeMatch = response.headers['content-range'].match(/\/(\d+)$/);

				if (totalSizeMatch) {
					expect(parseInt(totalSizeMatch[1])).toBe(fullSize);
				}
			}
		} else {
			// Extract the requested range from the request header
			const rangeMatch = range.match(/^bytes=(\d+)-(\d*)$/);

			if (!rangeMatch) {
				throw new Error(`Invalid range format: ${range}`);
			}

			const requestedStart = parseInt(rangeMatch[1]);
			const requestedEnd = rangeMatch[2] ? parseInt(rangeMatch[2]) : fullSize ? fullSize - 1 : undefined;

			expect(requestedStart).not.toBeNaN();

			// Verify the range in the response
			const contentRangeMatch = response.headers['content-range'].match(/^bytes (\d+)-(\d+)\/(\d+)$/);

			if (!contentRangeMatch) {
				throw new Error(`Invalid content-range format: ${response.headers['content-range']}`);
			}

			const actualStart = parseInt(contentRangeMatch[1]);
			const actualEnd = parseInt(contentRangeMatch[2]);
			const actualTotal = parseInt(contentRangeMatch[3]);

			// Verify the start matches
			expect(actualStart).toBe(requestedStart);

			// If full size is provided, verify the total is correct
			if (fullSize) {
				expect(actualTotal).toBe(fullSize);

				// The end may be adjusted if it exceeds the total size
				if (requestedEnd !== undefined && requestedEnd >= fullSize) {
					expect(actualEnd).toBe(fullSize - 1);
				} else if (requestedEnd !== undefined) {
					expect(actualEnd).toBe(requestedEnd);
				}
			}
		}

		// Verify that Content-Length is consistent
		const declaredLength = parseInt(response.headers['content-length']);
		expect(declaredLength).toBeGreaterThan(0);

		// If size differences are not allowed, body length must match exactly
		if (!opts.allowSizeDifference) {
			expect(response.body.length).toBe(declaredLength);
		} else {
			// Allow some difference but ensure it's within a reasonable tolerance
			const bodyLength = response.body.length;
			const diff = Math.abs(bodyLength - declaredLength);
			const tolerance = Math.max(declaredLength * 0.05, 10); // 5% or at least 10 bytes

			expect(diff).toBeLessThanOrEqual(tolerance);
		}
	} else if (expectedStatus === 200) {
		// For full content responses
		const declaredLength = parseInt(response.headers['content-length']);

		if (!opts.allowSizeDifference) {
			expect(response.body.length).toBe(declaredLength);
		}

		// If full size is provided, content-length must match
		if (fullSize !== undefined) {
			expect(declaredLength).toBe(fullSize);
		}
	}
};

export const expectValidStartRecordingResponse = (
	response: Response,
	roomId: string,
	roomName: string,
	expectedLayout?: MeetRecordingLayout,
	expectedEncoding?: MeetRecordingEncodingPreset | MeetRecordingEncodingOptions
) => {
	expect(response.status).toBe(201);
	expect(response.body).toHaveProperty('recordingId');

	expectValidRecordingLocationHeader(response);

	const recordingId = response.body.recordingId;
	expect(recordingId).toContain(roomId);
	expect(response.body).toHaveProperty('roomId', roomId);
	expect(response.body).toHaveProperty('roomName', roomName);
	expect(response.body).toHaveProperty('startDate');
	expect(response.body).toHaveProperty('status', 'active');
	expect(response.body).toHaveProperty('filename');
	expect(response.body).toHaveProperty('layout');
	expect(response.body).not.toHaveProperty('duration');
	expect(response.body).not.toHaveProperty('endDate');
	expect(response.body).not.toHaveProperty('size');

	// Validate expected layout if provided
	if (expectedLayout) {
		expect(response.body.layout).toEqual(expectedLayout);
	} else {
		// Default layout
		expect(response.body.layout).toEqual(DEFAULT_RECORDING_LAYOUT);
	}

	if (expectedEncoding !== undefined) {
		if (typeof expectedEncoding === 'string') {
			// Encoding preset
			expect(response.body.encoding).toEqual(expectedEncoding);
		} else {
			// Advanced encoding options
			expect(response.body.encoding).toMatchObject(expectedEncoding as any);
		}
	} else {
		// Default encoding preset
		expect(response.body.encoding).toEqual(DEFAULT_RECORDING_ENCODING_PRESET);
	}
};

export const expectValidStopRecordingResponse = (
	response: Response,
	recordingId: string,
	roomId: string,
	roomName: string,
	expectedLayout?: MeetRecordingLayout,
	expectedEncoding?: MeetRecordingEncodingPreset | MeetRecordingEncodingOptions
) => {
	expect(response.status).toBe(202);
	expectValidRecordingLocationHeader(response);
	expect(response.body).toHaveProperty('recordingId', recordingId);
	expect([MeetRecordingStatus.COMPLETE, MeetRecordingStatus.ENDING]).toContain(response.body.status);
	expect(response.body).toHaveProperty('roomId', roomId);
	expect(response.body).toHaveProperty('roomName', roomName);
	expect(response.body).toHaveProperty('filename');
	expect(response.body).toHaveProperty('startDate');
	expect(response.body).toHaveProperty('duration', expect.any(Number));
	expect(response.body).toHaveProperty('layout');
	expect(response.body).toHaveProperty('encoding');

	// Validate layout is a valid value
	if (expectedLayout) {
		expect(response.body.layout).toEqual(expectedLayout);
	} else {
		// Default layout
		expect(response.body.layout).toEqual(DEFAULT_RECORDING_LAYOUT);
	}

	// Validate encoding property
	if (expectedEncoding) {
		expect(response.body.encoding).toEqual(expectedEncoding);
	} else {
		// Default encoding preset
		expect(response.body.encoding).toEqual(DEFAULT_RECORDING_ENCODING_PRESET);
	}
};

export const expectValidGetRecordingResponse = (
	response: Response,
	expectedConfig: {
		recordingId: string;
		roomId: string;
		roomName: string;
		recordingStatus?: MeetRecordingStatus;
		recordingDuration?: number;
		recordingLayout?: MeetRecordingLayout;
		recordingEncoding?: MeetRecordingEncodingPreset | MeetRecordingEncodingOptions;
	}
) => {
	expect(response.status).toBe(200);
	const body = response.body;

	const { recordingId, roomId, roomName, recordingStatus, recordingDuration, recordingLayout, recordingEncoding } =
		expectedConfig;

	expect(body).toMatchObject({ recordingId, roomId, roomName });

	// Validate layout property
	if (recordingLayout !== undefined) {
		expect(body.layout).toBe(recordingLayout);
	} else {
		// Default layout
		expect(body.layout).toBe(DEFAULT_RECORDING_LAYOUT);
	}

	// Validate encoding property is present and coherent
	if (recordingEncoding !== undefined) {
		if (typeof recordingEncoding === 'string') {
			expect(body.encoding).toBe(recordingEncoding);
		} else {
			expect(body.encoding).toMatchObject(recordingEncoding as any);
		}
	} else {
		// Default encoding preset
		expect(body.encoding).toBe(DEFAULT_RECORDING_ENCODING_PRESET);
	}

	if (recordingStatus !== undefined) {
		expect(body.status).toBe(recordingStatus);
	} else {
		expect(Object.values(MeetRecordingStatus)).toContain(body.status);
	}

	const isRecFinished =
		recordingStatus &&
		(recordingStatus === MeetRecordingStatus.COMPLETE ||
			recordingStatus === MeetRecordingStatus.ABORTED ||
			recordingStatus === MeetRecordingStatus.FAILED ||
			recordingStatus === MeetRecordingStatus.LIMIT_REACHED);
	expect(body).toEqual(
		expect.objectContaining({
			recordingId: expect.stringMatching(new RegExp(`^${recordingId}$`)),
			roomId: expect.stringMatching(new RegExp(`^${roomId}$`)),
			roomName: expect.stringMatching(new RegExp(`^${roomName}$`)),
			...(isRecFinished ? { status: expect.any(String) } : {}),
			...(isRecFinished ? { duration: expect.any(Number) } : {}),
			...(isRecFinished ? { startDate: expect.any(Number) } : {}),
			...(isRecFinished ? { endDate: expect.any(Number) } : {}),
			...(isRecFinished ? { size: expect.any(Number) } : {}),
			filename: expect.any(String),
			...(isRecFinished ? { details: expect.any(String) } : {})
		})
	);

	if (isRecFinished) {
		expect(body.endDate).toBeGreaterThanOrEqual(body.startDate);
		expect(body.duration).toBeGreaterThanOrEqual(0);
	}

	if (isRecFinished && recordingDuration) {
		expect(body.duration).toBeLessThanOrEqual(recordingDuration);

		const computedSec = (body.endDate - body.startDate) / 1000;
		const diffSec = Math.abs(recordingDuration - computedSec);
		// Estimate 5 seconds of tolerace because of time to start/stop recording
		expect(diffSec).toBeLessThanOrEqual(5);
	}
};

export const expectSuccessListRecordingResponse = (
	response: Response,
	recordingLength: number,
	isTruncated: boolean,
	nextPageToken: boolean,
	maxItems = 10
) => {
	expect(response.status).toBe(200);
	expect(Array.isArray(response.body.recordings)).toBe(true);
	expect(response.body.recordings.length).toBe(recordingLength);
	expect(response.body.pagination.isTruncated).toBe(isTruncated);

	if (nextPageToken) {
		expect(response.body.pagination.nextPageToken).toEqual(expect.stringMatching(/\S+/));
	} else {
		expect(response.body.pagination.nextPageToken).toBeUndefined();
	}

	expect(response.body.pagination.maxItems).toBe(maxItems);
};

/** Asserts the recording access URL and returns the secret it carries. */
export const expectValidGetRecordingUrlResponse = (response: Response, recordingId: string): string => {
	expect(response.status).toBe(200);

	const parsedUrl = new URL(response.body.url);
	expect(parsedUrl.pathname).toBe(getFullPath(`/recording/${recordingId}`));

	const secret = parsedUrl.searchParams.get('recordingSecret');
	expect(secret).toEqual(expect.stringMatching(/\S+/));
	return secret!;
};

export const expectValidRoomMemberTokenResponse = (
	response: Response,
	validations: {
		roomId: string;
		memberId?: string;
		userId?: string;
		permissions: MeetRoomMemberPermissions;
		badge?: MeetRoomMemberUIBadge;
		isPromotedModerator?: boolean;
		joinMeeting?: boolean;
		participantName?: string;
		participantIdentityPrefix?: string;
	}
) => {
	const {
		roomId,
		memberId,
		userId,
		permissions,
		badge,
		isPromotedModerator,
		joinMeeting = false,
		participantName,
		participantIdentityPrefix
	} = validations;

	expect(response.status).toBe(200);
	expect(response.body).toHaveProperty('token');

	const token = response.body.token;
	const decodedToken = decodeJWTToken(token);

	if (joinMeeting) {
		expect(participantName).toBeDefined();
		expect(decodedToken).toHaveProperty('name', participantName);
		expect(decodedToken).toHaveProperty('sub');

		if (memberId || userId) {
			expect(decodedToken.sub).toBe(memberId || userId);
		} else if (participantIdentityPrefix) {
			expect(decodedToken.sub?.startsWith(participantIdentityPrefix)).toBe(true);
		}

		const livekitPermissions = getLiveKitPermissions(roomId, permissions!);
		expect(decodedToken).toHaveProperty('video', livekitPermissions);
	} else {
		expect(decodedToken).not.toHaveProperty('name');
		expect(decodedToken).not.toHaveProperty('sub');
		expect(decodedToken).not.toHaveProperty('video');
	}

	expect(decodedToken).toHaveProperty('metadata');
	const metadata = JSON.parse(decodedToken.metadata || '{}');
	expect(metadata).toHaveProperty('iat');
	expect(metadata).toHaveProperty('roomId', roomId);
	// Token metadata always carries only the current keys, while callers often source the expected
	// object from a wire response, which in compatibility mode also carries the deprecated aliases.
	expect(metadata).toHaveProperty('permissions', normalizePermissions(permissions));
	expect(metadata).toHaveProperty('badge', badge);

	if (memberId) {
		expect(metadata).toHaveProperty('memberId', memberId);
	} else {
		expect(metadata).not.toHaveProperty('memberId');
	}

	if (userId) {
		expect(metadata).toHaveProperty('userId', userId);
	} else {
		expect(metadata).not.toHaveProperty('userId');
	}

	if (isPromotedModerator !== undefined) {
		expect(metadata).toHaveProperty('isPromotedModerator', isPromotedModerator);
	} else {
		expect(metadata).not.toHaveProperty('isPromotedModerator');
	}

	if (joinMeeting) {
		expect(metadata).toHaveProperty('livekitUrl');
	} else {
		expect(metadata).not.toHaveProperty('livekitUrl');
	}
};

/** Assert a well-formed 200 response from createAssistant */
export const expectValidAssistantResponse = (response: Response, expectedId = 'dispatch-test-001') => {
	expect(response.status).toBe(201);
	expect(response.body).toMatchObject({ id: expectedId, status: 'active' });
	expect((response.body.id as string).trim().length).toBeGreaterThan(0);
};

const getLiveKitPermissions = (roomId: string, permissions: MeetRoomMemberPermissions): LiveKitPermissions => {
	const canPublishSources: TrackSource[] = [];

	if (permissions.mediaPublishAudio) {
		canPublishSources.push('microphone' as unknown as TrackSource);
	}

	if (permissions.mediaPublishVideo) {
		canPublishSources.push('camera' as unknown as TrackSource);
	}

	if (permissions.mediaShareScreen) {
		canPublishSources.push('screen_share' as unknown as TrackSource);
		canPublishSources.push('screen_share_audio' as unknown as TrackSource);
	}

	const livekitPermissions: LiveKitPermissions = {
		room: roomId,
		roomJoin: true,
		canPublish: permissions.mediaPublishAudio || permissions.mediaPublishVideo || permissions.mediaShareScreen,
		canPublishSources,
		canSubscribe: true,
		canPublishData: permissions.chatWrite,
		canUpdateOwnMetadata: false
	};
	return livekitPermissions;
};

const decodeJWTToken = (token: string) => {
	const tokenService = container.get(TokenService);
	return tokenService.getClaimsIgnoringExpiration(token);
};
