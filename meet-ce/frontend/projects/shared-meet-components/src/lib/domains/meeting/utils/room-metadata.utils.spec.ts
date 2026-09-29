import { hasReachedMeetingEnd, parseMeetingEndDate, parseMeetingStartDate } from './room-metadata.utils';

describe('parseMeetingStartDate', () => {
	it('reads the start the backend wrote at room creation', () => {
		const metadata = JSON.stringify({ createdBy: 'openvidu-meet', startDate: 1_700_000_000_000, roomOptions: {} });

		expect(parseMeetingStartDate(metadata)).toBe(1_700_000_000_000);
	});

	it('returns undefined for metadata that carries no usable start', () => {
		expect(parseMeetingStartDate(undefined)).toBeUndefined();
		expect(parseMeetingStartDate('{"createdBy":"openvidu-meet"}')).toBeUndefined();
		expect(parseMeetingStartDate('{"startDate":"1700000000000"}')).toBeUndefined();
		expect(parseMeetingStartDate('not json at all')).toBeUndefined();
		expect(parseMeetingStartDate('null')).toBeUndefined();
	});
});

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

/**
 * What tells a meeting force-ended at its duration limit from one a moderator ended: LiveKit reports
 * the same room deletion for both, so the only thing left to compare against is the end the meeting
 * carried.
 */
describe('hasReachedMeetingEnd', () => {
	const TOLERANCE_MS = 2_000;

	beforeEach(() => {
		jasmine.clock().install();
		jasmine.clock().mockDate();
	});

	afterEach(() => {
		jasmine.clock().uninstall();
	});

	it('is reached once the end has passed', () => {
		expect(hasReachedMeetingEnd(Date.now() - 1)).toBe(true);
		expect(hasReachedMeetingEnd(Date.now() - 60_000)).toBe(true);
	});

	it('is reached exactly at the end', () => {
		expect(hasReachedMeetingEnd(Date.now())).toBe(true);
	});

	it('is reached inside the tolerance before the end, which the backend may end early by', () => {
		expect(hasReachedMeetingEnd(Date.now() + TOLERANCE_MS)).toBe(true);
	});

	it('is not reached before the tolerance', () => {
		expect(hasReachedMeetingEnd(Date.now() + TOLERANCE_MS + 1)).toBe(false);
		expect(hasReachedMeetingEnd(Date.now() + 300_000)).toBe(false);
	});

	it('is never reached by a meeting with no end at all', () => {
		expect(hasReachedMeetingEnd(undefined)).toBe(false);
	});
});
