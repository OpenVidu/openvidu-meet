import { expect } from '@jest/globals';
import INTERNAL_CONFIG from '../../src/config/internal-config';
import { MeetRecordingStatus, MeetRoom, MeetRoomPreferences } from '../../src/typings/ce';
const RECORDINGS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings`;

const expectErrorResponse = (
	response: any,
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

export const expectValidationError = (response: any, path: string, message: string) => {
	expectErrorResponse(response, 422, 'Unprocessable Entity', 'Invalid request', [{ field: path, message }]);
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
			recordingPreferences: { enabled: true },
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

export const expectValidRoomWithFields = (room: MeetRoom, fields: string[] = []) => {
	expect(room).toBeDefined();
	expectObjectFields(room, fields);
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

export const expectValidRecordingLocationHeader = (response: any) => {
	// const locationRegex = new RegExp(
	// 	`^http://127\\.0\\.0\\.1:\\d+/+${RECORDINGS_PATH.replace(/\//g, '\\/')}/${recordingId}$`
	// );
	// expect(response.headers.location).toMatch(locationRegex);
	expect(response.headers.location).toBeDefined();
	expect(response.headers.location).toContain('127.0.0.1');
	expect(response.headers.location).toContain(RECORDINGS_PATH);
	expect(response.headers.location).toContain(response.body.recordingId);
};

export const expectValidStartRecordingResponse = (response: any, roomId: string) => {
	expect(response.status).toBe(201);
	expect(response.body).toHaveProperty('recordingId');
	const recordingId = response.body.recordingId;
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
	expect(response.body).toHaveProperty('status', 'ENDING');
	expect(response.body).toHaveProperty('roomId', roomId);
	expect(response.body).toHaveProperty('filename');
	expect(response.body).toHaveProperty('startDate');
	expect(response.body).toHaveProperty('duration', expect.any(Number));
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

	expect(body).toEqual(
		expect.objectContaining({
			duration: expect.any(Number),
			startDate: expect.any(Number),
			endDate: expect.any(Number),
			size: expect.any(Number),
			filename: expect.any(String),
			details: expect.any(String)
		})
	);

	expect(body.duration).toBeGreaterThanOrEqual(0);
	expect(body.status).toBeDefined();

	if (status !== undefined) {
		expect(body.status).toBe(status);
	} else {
		expect(body.status).toBe('COMPLETE');
	}

	expect(body.endDate).toBeGreaterThanOrEqual(body.startDate);

	if (maxSecDuration) {
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
