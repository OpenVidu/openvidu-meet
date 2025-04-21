import { expect } from '@jest/globals';
import INTERNAL_CONFIG from '../../src/config/internal-config';
const RECORDINGS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings`;

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
