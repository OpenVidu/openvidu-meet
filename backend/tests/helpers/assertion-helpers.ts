import { expect } from '@jest/globals';
import INTERNAL_CONFIG from '../../src/config/internal-config';
import {
	MeetRecordingAccess,
	MeetRecordingInfo,
	MeetRecordingStatus,
	MeetRoom,
	MeetRoomPreferences,
	ParticipantRole
} from '../../src/typings/ce';

const RECORDINGS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings`;

export const expectErrorResponse = (
	response: any,
	status = 422,
	error = 'Unprocessable Entity',
	message = 'Invalid request',
	details?: Array<{ field?: string; message: string }>
) => {
	expect(response.status).toBe(status);
	expect(response.body).toMatchObject({
		...(error ? { error } : {}),
		...(message ? { message } : {})
	});

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

export const expectValidationError = (response: any, field: string, message: string) => {
	expectErrorResponse(response, 422, 'Unprocessable Entity', 'Invalid request', [{ field, message }]);
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
	response: any,
	expectedRoomLength: number,
	expectedMaxItems: number,
	expectedTruncated: boolean,
	expectedNextPageToken: boolean
) => {
	const { body } = response;
	expect(response.status).toBe(200);
	expect(body).toBeDefined();
	expect(body.rooms).toBeDefined();
	expect(Array.isArray(body.rooms)).toBe(true);
	expect(body.rooms.length).toBe(expectedRoomLength);
	expect(body.pagination).toBeDefined();
	expect(body.pagination.isTruncated).toBe(expectedTruncated);

	expectedNextPageToken
		? expect(body.pagination.nextPageToken).toBeDefined()
		: expect(body.pagination.nextPageToken).toBeUndefined();
	expect(body.pagination.maxItems).toBe(expectedMaxItems);
};

export const expectSuccessRoomResponse = (
	response: any,
	idPrefix: string,
	autoDeletionDate?: number,
	preferences?: MeetRoomPreferences
) => {
	expect(response.status).toBe(200);
	expectValidRoom(response.body, idPrefix, autoDeletionDate, preferences);
};

export const expectSuccessRoomPreferencesResponse = (response: any, preferences: MeetRoomPreferences) => {
	expect(response.status).toBe(200);
	expect(response.body).toBeDefined();
	expect(response.body).toEqual(preferences);
};

export const expectValidRoom = (
	room: MeetRoom,
	idPrefix: string,
	autoDeletionDate?: number,
	preferences?: MeetRoomPreferences,
	markedForDeletion?: boolean
) => {
	expect(room).toBeDefined();

	expect(room.roomId).toBeDefined();
	expect(room.roomIdPrefix).toBeDefined();
	expect(room.roomIdPrefix).toBe(idPrefix);
	expect(room.roomId).not.toBe('');
	expect(room.roomId).toContain(room.roomIdPrefix);
	expect(room.creationDate).toBeDefined();

	if (autoDeletionDate !== undefined) {
		expect(room.autoDeletionDate).toBeDefined();
		expect(room.autoDeletionDate).toBe(autoDeletionDate);
	} else {
		expect(room.autoDeletionDate).toBeUndefined();
	}

	expect(room.preferences).toBeDefined();

	if (preferences !== undefined) {
		expect(room.preferences).toEqual(preferences);
	} else {
		expect(room.preferences).toEqual({
			recordingPreferences: {
				enabled: true,
				allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			},
			chatPreferences: { enabled: true },
			virtualBackgroundPreferences: { enabled: true }
		});
	}

	expect(room.moderatorRoomUrl).toBeDefined();
	expect(room.publisherRoomUrl).toBeDefined();
	expect(room.moderatorRoomUrl).toContain(room.roomId);
	expect(room.publisherRoomUrl).toContain(room.roomId);

	if (markedForDeletion !== undefined) {
		expect(room.autoDeletionDate).toBeDefined();

		expect(room.markedForDeletion).toBe(markedForDeletion ?? false);
	}
};

export const expectValidRecording = (
	recording: MeetRecordingInfo,
	recordingId: string,
	roomId: string,
	status: MeetRecordingStatus
) => {
	expect(recording).toBeDefined();
	expect(recording.recordingId).toBeDefined();
	expect(recording.roomId).toBeDefined();
	expect(recording.recordingId).toBe(recordingId);
	expect(recording.roomId).toBe(roomId);
	expect(recording.startDate).toBeDefined();
	expect(recording.status).toBeDefined();
	expect(recording.status).toBe(status);
	expect(recording.filename).toBeDefined();
	expect(recording.details).toBeDefined();
};

export const expectValidRoomWithFields = (room: MeetRoom, fields: string[] = []) => {
	expect(room).toBeDefined();
	expectObjectFields(room, fields);
};

export const expectValidRecordingWithFields = (rec: MeetRecordingInfo, fields: string[] = []) => {
	expect(rec).toBeDefined();
	expectObjectFields(rec, fields);
};

const expectObjectFields = (obj: any, present: string[] = [], absent: string[] = []) => {
	present.forEach((key) => {
		expect(obj).toHaveProperty(key);
		expect((obj as any)[key]).not.toBeUndefined();
	});
	absent.forEach((key) => {
		// Si la propiedad existe, debe ser undefined
		expect(Object.prototype.hasOwnProperty.call(obj, key) ? (obj as any)[key] : undefined).toBeUndefined();
	});
};

// Validate recording location header in the response
export const expectValidRecordingLocationHeader = (response: any) => {
	const locationHeader = response.headers.location;
	expect(locationHeader).toBeDefined();
	const locationHeaderUrl = new URL(locationHeader);
	expect(locationHeaderUrl.pathname).toBe(
		`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${response.body.recordingId}`
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
	response: any,
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
	expect(response.headers['content-length']).toBeDefined();
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

export const expectValidStartRecordingResponse = (response: any, roomId: string) => {
	expect(response.status).toBe(201);
	expect(response.body).toHaveProperty('recordingId');

	expectValidRecordingLocationHeader(response);

	const recordingId = response.body.recordingId;
	expect(recordingId).toBeDefined();

	expect(recordingId).toContain(roomId);
	expect(response.body).toHaveProperty('roomId', roomId);
	expect(response.body).toHaveProperty('startDate');
	expect(response.body).toHaveProperty('status', 'ACTIVE');
	expect(response.body).toHaveProperty('filename');
	expect(response.body).not.toHaveProperty('duration');
	expect(response.body).not.toHaveProperty('endDate');
	expect(response.body).not.toHaveProperty('size');
};

export const expectValidStopRecordingResponse = (response: any, recordingId: string, roomId: string) => {
	expect(response.status).toBe(202);
	expect(response.body).toBeDefined();
	expect(response.body).toHaveProperty('recordingId', recordingId);
	expect([MeetRecordingStatus.COMPLETE, MeetRecordingStatus.ENDING]).toContain(response.body.status);
	expect(response.body).toHaveProperty('roomId', roomId);
	expect(response.body).toHaveProperty('filename');
	expect(response.body).toHaveProperty('startDate');
	expect(response.body).toHaveProperty('duration', expect.any(Number));

	expectValidRecordingLocationHeader(response);
};

export const expectValidGetRecordingResponse = (
	response: any,
	recordingId: string,
	roomId: string,
	status?: MeetRecordingStatus,
	maxSecDuration?: number
) => {
	expect(response.status).toBe(200);
	expect(response.body).toBeDefined();
	const body = response.body;

	expect(body).toMatchObject({ recordingId, roomId });

	const isRecFinished =
		status &&
		(status === MeetRecordingStatus.COMPLETE ||
			status === MeetRecordingStatus.ABORTED ||
			status === MeetRecordingStatus.FAILED ||
			status === MeetRecordingStatus.LIMIT_REACHED);
	expect(body).toEqual(
		expect.objectContaining({
			recordingId: expect.stringMatching(new RegExp(`^${recordingId}$`)),
			roomId: expect.stringMatching(new RegExp(`^${roomId}$`)),
			...(isRecFinished ? { status: expect.any(String) } : {}),
			...(isRecFinished ? { duration: expect.any(Number) } : {}),
			...(isRecFinished ? { startDate: expect.any(Number) } : {}),
			...(isRecFinished ? { endDate: expect.any(Number) } : {}),
			...(isRecFinished ? { size: expect.any(Number) } : {}),
			filename: expect.any(String),
			...(isRecFinished ? { details: expect.any(String) } : {})
		})
	);

	expect(body.status).toBeDefined();

	if (status !== undefined) {
		expect(body.status).toBe(status);
	}

	if (isRecFinished) {
		expect(body.endDate).toBeGreaterThanOrEqual(body.startDate);
		expect(body.duration).toBeGreaterThanOrEqual(0);
	}

	if (isRecFinished && maxSecDuration) {
		expect(body.duration).toBeLessThanOrEqual(maxSecDuration);

		const computedSec = (body.endDate - body.startDate) / 1000;
		const diffSec = Math.abs(maxSecDuration - computedSec);
		// Estimate 5 seconds of tolerace because of time to start/stop recording
		expect(diffSec).toBeLessThanOrEqual(5);
	}
};

export const expectSuccessListRecordingResponse = (
	response: any,
	recordingLength: number,
	isTruncated: boolean,
	nextPageToken: boolean,
	maxItems = 10
) => {
	expect(response.status).toBe(200);
	expect(response.body).toBeDefined();
	expect(response.body.recordings).toBeDefined();
	expect(Array.isArray(response.body.recordings)).toBe(true);
	expect(response.body.recordings.length).toBe(recordingLength);
	expect(response.body.pagination).toBeDefined();
	expect(response.body.pagination.isTruncated).toBe(isTruncated);

	if (nextPageToken) {
		expect(response.body.pagination.nextPageToken).toBeDefined();
	} else {
		expect(response.body.pagination.nextPageToken).toBeUndefined();
	}

	expect(response.body.pagination.maxItems).toBeDefined();
	expect(response.body.pagination.maxItems).toBeGreaterThan(0);
	expect(response.body.pagination.maxItems).toBeLessThanOrEqual(100);
	expect(response.body.pagination.maxItems).toBe(maxItems);
};

export const expectValidGetRecordingUrlResponse = (response: any, recordingId: string) => {
	expect(response.status).toBe(200);
	const recordingUrl = response.body.url;
	expect(recordingUrl).toBeDefined();
	
	const parsedUrl = new URL(recordingUrl);
	expect(parsedUrl.pathname).toBe(
		`/recording/${recordingId}`
	);
	expect(parsedUrl.searchParams.get('secret')).toBeDefined();
};

export const expectValidRoomRolesAndPermissionsResponse = (response: any, roomId: string) => {
	expect(response.status).toBe(200);
	expect(response.body).toEqual(
		expect.arrayContaining([
			{
				role: ParticipantRole.MODERATOR,
				permissions: getPermissions(roomId, ParticipantRole.MODERATOR)
			},
			{
				role: ParticipantRole.PUBLISHER,
				permissions: getPermissions(roomId, ParticipantRole.PUBLISHER)
			}
		])
	);
};

export const expectValidRoomRoleAndPermissionsResponse = (
	response: any,
	roomId: string,
	participantRole: ParticipantRole
) => {
	expect(response.status).toBe(200);
	expect(response.body).toEqual({
		role: participantRole,
		permissions: getPermissions(roomId, participantRole)
	});
};

const getPermissions = (roomId: string, role: ParticipantRole) => {
	switch (role) {
		case ParticipantRole.MODERATOR:
			return {
				livekit: {
					roomCreate: true,
					roomJoin: true,
					roomList: true,
					roomRecord: true,
					roomAdmin: true,
					room: roomId,
					ingressAdmin: true,
					canPublish: true,
					canSubscribe: true,
					canPublishData: true,
					canUpdateOwnMetadata: true,
					hidden: false,
					recorder: false,
					agent: false
				},
				openvidu: {
					canPublishScreen: true,
					canRecord: true,
					canChat: true,
					canChangeVirtualBackground: true
				}
			};
		case ParticipantRole.PUBLISHER:
			return {
				livekit: {
					roomCreate: false,
					roomJoin: true,
					roomList: true,
					roomRecord: false,
					roomAdmin: false,
					room: roomId,
					ingressAdmin: false,
					canPublish: true,
					canSubscribe: true,
					canPublishData: true,
					canUpdateOwnMetadata: true,
					hidden: false,
					recorder: false,
					agent: false
				},
				openvidu: {
					canPublishScreen: true,
					canRecord: false,
					canChat: true,
					canChangeVirtualBackground: true
				}
			};
		default:
			throw new Error(`Unknown role ${role}`);
	}
};

export const expectValidParticipantTokenResponse = (
	response: any,
	roomId: string,
	participantName: string,
	participantRole: ParticipantRole
) => {
	expect(response.status).toBe(200);
	expect(response.body).toHaveProperty('token');

	const token = response.body.token;
	const decodedToken = decodeJWTToken(token);

	const permissions = getPermissions(roomId, participantRole);

	expect(decodedToken).toHaveProperty('sub', participantName);
	expect(decodedToken).toHaveProperty('video', permissions.livekit);
	expect(decodedToken).toHaveProperty('metadata');
	const metadata = JSON.parse(decodedToken.metadata);
	expect(metadata).toHaveProperty('role', participantRole);
	expect(metadata).toHaveProperty('permissions', permissions.openvidu);

	// Check that the token is included in a cookie
	expect(response.headers['set-cookie']).toBeDefined();
	const cookies = response.headers['set-cookie'] as unknown as string[];
	const participantTokenCookie = cookies.find((cookie) =>
		cookie.startsWith(`${INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME}=`)
	) as string;
	expect(participantTokenCookie).toBeDefined();
	expect(participantTokenCookie).toContain(token);
	expect(participantTokenCookie).toContain('HttpOnly');
	expect(participantTokenCookie).toContain('SameSite=Strict');
	expect(participantTokenCookie).toContain('Path=/');
};

export const expectValidRecordingTokenResponse = (
	response: any,
	roomId: string,
	participantRole: ParticipantRole,
	canRetrieveRecordings: boolean,
	canDeleteRecordings: boolean
) => {
	expect(response.status).toBe(200);
	expect(response.body).toHaveProperty('token');

	const token = response.body.token;
	const decodedToken = decodeJWTToken(token);

	expect(decodedToken).toHaveProperty('video', {
		room: roomId
	});
	expect(decodedToken).toHaveProperty('metadata');
	const metadata = JSON.parse(decodedToken.metadata);
	expect(metadata).toHaveProperty('role', participantRole);
	expect(metadata).toHaveProperty('recordingPermissions', {
		canRetrieveRecordings,
		canDeleteRecordings
	});

	// Check that the token is included in a cookie
	expect(response.headers['set-cookie']).toBeDefined();
	const cookies = response.headers['set-cookie'] as unknown as string[];
	const participantTokenCookie = cookies.find((cookie) =>
		cookie.startsWith(`${INTERNAL_CONFIG.RECORDING_TOKEN_COOKIE_NAME}=`)
	) as string;
	expect(participantTokenCookie).toBeDefined();
	expect(participantTokenCookie).toContain(token);
	expect(participantTokenCookie).toContain('HttpOnly');
	expect(participantTokenCookie).toContain('SameSite=Strict');
	expect(participantTokenCookie).toContain('Path=/');
};

const decodeJWTToken = (token: string) => {
	const base64Url = token.split('.')[1];
	const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
	const jsonPayload = decodeURIComponent(
		atob(base64)
			.split('')
			.map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
			.join('')
	);
	return JSON.parse(jsonPayload);
};
