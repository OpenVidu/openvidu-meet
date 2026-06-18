import { describe, expect, it } from '@jest/globals';
import { WebComponentNavigationType } from '@openvidu-meet/shared-components';
import { modeFromAttributes, modeFromRequest, type ModeInputs } from '../../src/app/modes/mode';

const BASE_INPUTS: ModeInputs = {
	roomUrl: '',
	recordingUrl: '',
	participantName: '',
	e2eeKey: '',
	leaveRedirectUrl: '',
	showOnlyRecordings: false,
	showRecording: ''
};

const inputs = (overrides: Partial<ModeInputs>): ModeInputs => ({ ...BASE_INPUTS, ...overrides });

describe('Mode resolution from attributes', () => {
	it('returns "single-recording" when recording-url is set', () => {
		expect(modeFromAttributes(inputs({ recordingUrl: 'https://x/recording/rec-1' }))).toBe('single-recording');
	});

	it('returns "single-recording" when show-recording is set', () => {
		expect(modeFromAttributes(inputs({ showRecording: 'rec-1' }))).toBe('single-recording');
	});

	it('prefers single-recording over a room view when both recording-url and room-url are set', () => {
		expect(modeFromAttributes(inputs({ roomUrl: 'https://x/room/r1', recordingUrl: 'https://x/recording/rec-1' }))).toBe(
			'single-recording'
		);
	});

	it('returns "meeting" when only room-url is set', () => {
		expect(modeFromAttributes(inputs({ roomUrl: 'https://x/room/r1' }))).toBe('meeting');
	});

	it('returns "room-recordings" when room-url is set and show-only-recordings is enabled', () => {
		expect(modeFromAttributes(inputs({ roomUrl: 'https://x/room/r1', showOnlyRecordings: true }))).toBe(
			'room-recordings'
		);
	});

	it('returns "invalid" when no attributes are provided', () => {
		expect(modeFromAttributes(inputs({}))).toBe('invalid');
	});
});

describe('Mode resolution from navigation requests', () => {
	it('returns null when there is no request', () => {
		expect(modeFromRequest(null)).toBeNull();
	});

	it('maps a view-recordings request to "room-recordings"', () => {
		expect(modeFromRequest({ type: WebComponentNavigationType.VIEW_RECORDINGS, roomId: 'r1' })).toBe(
			'room-recordings'
		);
	});

	it('maps a login request to "login"', () => {
		expect(modeFromRequest({ type: WebComponentNavigationType.LOGIN })).toBe('login');
	});

	it('maps a change-password request to "change-password"', () => {
		expect(modeFromRequest({ type: WebComponentNavigationType.CHANGE_PASSWORD })).toBe('change-password');
	});
});
