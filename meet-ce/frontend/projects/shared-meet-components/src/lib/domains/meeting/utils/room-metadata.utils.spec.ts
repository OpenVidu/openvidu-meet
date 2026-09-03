import { parseMeetingEndDate } from './room-metadata.utils';

describe('parseMeetingEndDate', () => {
	// Mirrors what the backend writes into the LiveKit room metadata at room creation.
	const meetMetadata = (endDate: unknown): string =>
		JSON.stringify({ createdBy: 'openvidu-meet', endDate, roomOptions: {} });

	it('reads the deadline the backend wrote at room creation', () => {
		expect(parseMeetingEndDate(meetMetadata(1_700_003_600_000))).toBe(1_700_003_600_000);
	});

	it('returns undefined for a meeting that declares no deadline', () => {
		expect(parseMeetingEndDate(meetMetadata(undefined))).toBeUndefined();
		expect(parseMeetingEndDate('{"createdBy":"openvidu-meet"}')).toBeUndefined();
	});

	it('returns undefined when there is no metadata at all', () => {
		// A room LiveKit auto-created, which carries no Meet metadata.
		expect(parseMeetingEndDate(undefined)).toBeUndefined();
		expect(parseMeetingEndDate('')).toBeUndefined();
	});

	it('returns undefined when the metadata is not valid JSON', () => {
		expect(parseMeetingEndDate('not json at all')).toBeUndefined();
		expect(parseMeetingEndDate('{"endDate":')).toBeUndefined();
	});

	it('returns undefined for a deadline that is not a usable number', () => {
		expect(parseMeetingEndDate(meetMetadata('1700003600000'))).toBeUndefined();
		expect(parseMeetingEndDate(meetMetadata(null))).toBeUndefined();
		// JSON widens this to Infinity, which as a deadline would never be reached
		expect(parseMeetingEndDate('{"endDate":1e999}')).toBeUndefined();
	});
});
