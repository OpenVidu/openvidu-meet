import type { WebComponentPropertyValues } from '@openvidu-meet/typings';
import { LeftEventReason } from '@openvidu-meet/typings';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { WcRoute, WcRouteName } from '../models/wc-route.model';
import { wcRouteFromAttributes, wcRouteFromPath, wcRouteIdentity, wcRouteToPath, sameWcRoute } from './wc-route.utils';

const BASE_INPUTS: Required<WebComponentPropertyValues> = {
	roomUrl: '',
	recordingUrl: '',
	participantName: '',
	e2eeKey: '',
	leaveRedirectUrl: '',
	showOnlyRecordings: false,
	showRecording: ''
};

const inputs = (overrides: Partial<WebComponentPropertyValues>): Required<WebComponentPropertyValues> => ({
	...BASE_INPUTS,
	...overrides
});

describe('wcRouteFromAttributes', () => {
	it('resolves single-recording from recording-url, extracting id + recordingSecret', () => {
		const route = wcRouteFromAttributes(inputs({ recordingUrl: 'https://x/recording/rec-1?recordingSecret=s' }));
		expect(route).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.SINGLE_RECORDING,
				params: jasmine.objectContaining({ recordingId: 'rec-1', recordingSecret: 's' })
			})
		);
	});

	it('carries the room secret onto a single-recording route from the room-url', () => {
		const route = wcRouteFromAttributes(
			inputs({ recordingUrl: 'https://x/recording/rec-1', roomUrl: 'https://x/room/r1?secret=rs' })
		);
		expect(route).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.SINGLE_RECORDING,
				params: jasmine.objectContaining({ recordingId: 'rec-1', roomSecret: 'rs' })
			})
		);
	});

	it('resolves single-recording from show-recording', () => {
		const route = wcRouteFromAttributes(inputs({ showRecording: 'rec-1' }));
		expect(route).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.SINGLE_RECORDING,
				params: jasmine.objectContaining({ recordingId: 'rec-1' })
			})
		);
	});

	it('prefers single-recording over a room view when both recording-url and room-url are set', () => {
		const route = wcRouteFromAttributes(inputs({ roomUrl: 'https://x/room/r1', recordingUrl: 'https://x/recording/rec-1' }));
		expect(route.name).toBe(WcRouteName.SINGLE_RECORDING);
	});

	it('resolves invalid when a recording is requested but no id can be extracted', () => {
		const route = wcRouteFromAttributes(inputs({ recordingUrl: 'not a url' }));
		expect(route.name).toBe(WcRouteName.INVALID);
	});

	it('resolves meeting from room-url, carrying secret/e2ee/name/leaveRedirectUrl', () => {
		const route = wcRouteFromAttributes(
			inputs({
				roomUrl: 'https://x/room/r1?secret=sec',
				e2eeKey: 'k',
				participantName: 'Alice',
				leaveRedirectUrl: 'https://back'
			})
		);
		expect(route).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.MEETING,
				params: jasmine.objectContaining({
					roomId: 'r1',
					secret: 'sec',
					e2eeKey: 'k',
					participantName: 'Alice',
					leaveRedirectUrl: 'https://back'
				})
			})
		);
	});

	it('resolves room-recordings when show-only-recordings is enabled', () => {
		const route = wcRouteFromAttributes(inputs({ roomUrl: 'https://x/room/r1', showOnlyRecordings: true }));
		expect(route).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.ROOM_RECORDINGS,
				params: jasmine.objectContaining({ roomId: 'r1' })
			})
		);
	});

	it('resolves invalid when no room/recording attribute is provided', () => {
		expect(wcRouteFromAttributes(inputs({})).name).toBe(WcRouteName.INVALID);
	});

	it('resolves invalid when the room URL has no extractable id', () => {
		expect(wcRouteFromAttributes(inputs({ roomUrl: 'not a url' })).name).toBe(WcRouteName.INVALID);
	});
});

describe('wcRouteIdentity', () => {
	it('ignores non-identity params (e.g. participant-name) so they do not trigger re-navigation', () => {
		const a = wcRouteFromAttributes(inputs({ roomUrl: 'https://x/room/r1', participantName: 'Alice' }));
		const b = wcRouteFromAttributes(inputs({ roomUrl: 'https://x/room/r1', participantName: 'Bob' }));
		expect(wcRouteIdentity(a)).toBe(wcRouteIdentity(b));
	});

	it('differs when the room changes', () => {
		const a = wcRouteFromAttributes(inputs({ roomUrl: 'https://x/room/r1' }));
		const b = wcRouteFromAttributes(inputs({ roomUrl: 'https://x/room/r2' }));
		expect(wcRouteIdentity(a)).not.toBe(wcRouteIdentity(b));
	});

	it('differs between meeting and room-recordings for the same room', () => {
		const meeting = wcRouteFromAttributes(inputs({ roomUrl: 'https://x/room/r1' }));
		const recordings = wcRouteFromAttributes(inputs({ roomUrl: 'https://x/room/r1', showOnlyRecordings: true }));
		expect(wcRouteIdentity(meeting)).not.toBe(wcRouteIdentity(recordings));
	});

	it('keys a single-recording route by its recording id', () => {
		const a = wcRouteFromAttributes(inputs({ showRecording: 'rec-1' }));
		const b = wcRouteFromAttributes(inputs({ showRecording: 'rec-2' }));
		expect(wcRouteIdentity(a)).toContain('rec-1');
		expect(wcRouteIdentity(a)).not.toBe(wcRouteIdentity(b));
	});

	it('falls back to the bare route name for non-resource routes', () => {
		expect(wcRouteIdentity({ name: WcRouteName.LOGIN, params: {} })).toBe(WcRouteName.LOGIN);
		expect(wcRouteIdentity({ name: WcRouteName.INVALID, params: { message: 'bad config' } })).toBe(
			WcRouteName.INVALID
		);
		expect(wcRouteIdentity({ name: WcRouteName.ERROR, params: { reason: NavigationErrorReason.INTERNAL_ERROR } })).toBe(
			WcRouteName.ERROR
		);
	});
});

describe('wcRouteToPath', () => {
	it('serializes a meeting route (omitting an absent secret)', () => {
		expect(wcRouteToPath({ name: WcRouteName.MEETING, params: { roomId: 'r1' } })).toBe('/room/r1');
	});

	it('serializes a meeting route with its secret', () => {
		expect(wcRouteToPath({ name: WcRouteName.MEETING, params: { roomId: 'r1', secret: 'sec' } })).toBe(
			'/room/r1?secret=sec'
		);
	});

	it('serializes a single-recording route with both secrets', () => {
		expect(
			wcRouteToPath({
				name: WcRouteName.SINGLE_RECORDING,
				params: { recordingId: 'rec', recordingSecret: 's', roomSecret: 'rs' }
			})
		).toBe('/recording/rec?recordingSecret=s&roomSecret=rs');
	});

	it('serializes room-recordings', () => {
		expect(wcRouteToPath({ name: WcRouteName.ROOM_RECORDINGS, params: { roomId: 'r1' } })).toBe('/room/r1/recordings');
	});

	it('serializes login with and without a redirectTo', () => {
		expect(wcRouteToPath({ name: WcRouteName.LOGIN, params: { redirectTo: '/recording/rec' } })).toBe(
			'/login?redirectTo=%2Frecording%2Frec'
		);
		expect(wcRouteToPath({ name: WcRouteName.LOGIN, params: {} })).toBe('/login');
	});

	it('serializes change-password with redirectTo', () => {
		expect(wcRouteToPath({ name: WcRouteName.CHANGE_PASSWORD, params: { redirectTo: '/room/r1' } })).toBe(
			'/change-password-required?redirectTo=%2Froom%2Fr1'
		);
	});

	it('serializes an error route carrying its reason', () => {
		expect(wcRouteToPath({ name: WcRouteName.ERROR, params: { reason: NavigationErrorReason.CLOSED_ROOM } })).toBe(
			'/error?reason=closed-room'
		);
	});

	it('serializes a disconnected route carrying its reason', () => {
		expect(wcRouteToPath({ name: WcRouteName.DISCONNECTED, params: { reason: LeftEventReason.MEETING_ENDED } })).toBe(
			'/disconnected?reason=meeting_ended'
		);
	});

	it('returns null for an invalid route', () => {
		expect(wcRouteToPath({ name: WcRouteName.INVALID, params: { message: 'bad config' } })).toBeNull();
	});
});

describe('wcRouteFromPath', () => {
	it('parses a meeting path (with and without secret)', () => {
		expect(wcRouteFromPath('/room/r1')).toEqual(
			jasmine.objectContaining({ name: WcRouteName.MEETING, params: jasmine.objectContaining({ roomId: 'r1' }) })
		);
		expect(wcRouteFromPath('/room/r1?secret=sec')).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.MEETING,
				params: jasmine.objectContaining({ roomId: 'r1', secret: 'sec' })
			})
		);
	});

	it('parses room-recordings (before the bare room path)', () => {
		expect(wcRouteFromPath('/room/r1/recordings')).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.ROOM_RECORDINGS,
				params: jasmine.objectContaining({ roomId: 'r1' })
			})
		);
	});

	it('parses a single-recording path with both secrets', () => {
		expect(wcRouteFromPath('/recording/rec?recordingSecret=s&roomSecret=rs')).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.SINGLE_RECORDING,
				params: jasmine.objectContaining({ recordingId: 'rec', recordingSecret: 's', roomSecret: 'rs' })
			})
		);
	});

	it('parses login with redirectTo', () => {
		expect(wcRouteFromPath('/login?redirectTo=%2Frecording%2Frec')).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.LOGIN,
				params: jasmine.objectContaining({ redirectTo: '/recording/rec' })
			})
		);
	});

	it('parses change-password with redirectTo', () => {
		expect(wcRouteFromPath('/change-password-required?redirectTo=%2Froom%2Fr1')).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.CHANGE_PASSWORD,
				params: jasmine.objectContaining({ redirectTo: '/room/r1' })
			})
		);
	});

	it('parses an error path, honouring its reason', () => {
		expect(wcRouteFromPath('/error?reason=closed-room')).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.ERROR,
				params: jasmine.objectContaining({ reason: NavigationErrorReason.CLOSED_ROOM })
			})
		);
	});

	it('defaults the error reason to internal-error when absent', () => {
		expect(wcRouteFromPath('/error')).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.ERROR,
				params: jasmine.objectContaining({ reason: NavigationErrorReason.INTERNAL_ERROR })
			})
		);
	});

	it('parses a disconnected path, honouring its reason', () => {
		expect(wcRouteFromPath('/disconnected?reason=meeting_ended')).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.DISCONNECTED,
				params: jasmine.objectContaining({ reason: LeftEventReason.MEETING_ENDED })
			})
		);
	});

	it('defaults the disconnected reason to unknown when absent', () => {
		expect(wcRouteFromPath('/disconnected')).toEqual(
			jasmine.objectContaining({
				name: WcRouteName.DISCONNECTED,
				params: jasmine.objectContaining({ reason: LeftEventReason.UNKNOWN })
			})
		);
	});

	it('returns null for unrecognized/empty paths', () => {
		expect(wcRouteFromPath('/whatever')).toBeNull();
		expect(wcRouteFromPath('')).toBeNull();
	});
});

describe('wcRouteToPath → wcRouteFromPath round-trip (redirect-after-login)', () => {
	const cases: WcRoute[] = [
		{ name: WcRouteName.MEETING, params: { roomId: 'r1', secret: 'sec' } },
		{ name: WcRouteName.SINGLE_RECORDING, params: { recordingId: 'rec', recordingSecret: 's', roomSecret: 'rs' } },
		{ name: WcRouteName.ROOM_RECORDINGS, params: { roomId: 'r1', secret: 'sec' } },
		{ name: WcRouteName.ERROR, params: { reason: NavigationErrorReason.CLOSED_ROOM } },
		{ name: WcRouteName.DISCONNECTED, params: { reason: LeftEventReason.MEETING_ENDED } }
	];

	for (const original of cases) {
		it(`preserves a ${original.name} destination through its serialized path`, () => {
			const path = wcRouteToPath(original)!;
			expect(sameWcRoute(wcRouteFromPath(path), original)).toBe(true);
		});
	}
});

describe('sameWcRoute', () => {
	it('is true for structurally identical routes', () => {
		expect(
			sameWcRoute(
				{ name: WcRouteName.MEETING, params: { roomId: 'r1' } },
				{ name: WcRouteName.MEETING, params: { roomId: 'r1' } }
			)
		).toBe(true);
	});

	it('is true for the same reference (including both null)', () => {
		const route: WcRoute = { name: WcRouteName.MEETING, params: { roomId: 'r1' } };
		expect(sameWcRoute(route, route)).toBe(true);
		expect(sameWcRoute(null, null)).toBe(true);
	});

	it('is false when params differ', () => {
		expect(
			sameWcRoute(
				{ name: WcRouteName.MEETING, params: { roomId: 'r1' } },
				{ name: WcRouteName.MEETING, params: { roomId: 'r2' } }
			)
		).toBe(false);
	});

	it('is false when the route names differ', () => {
		expect(
			sameWcRoute(
				{ name: WcRouteName.MEETING, params: { roomId: 'r1' } },
				{ name: WcRouteName.ROOM_RECORDINGS, params: { roomId: 'r1' } }
			)
		).toBe(false);
	});

	it('is false when either route is null', () => {
		expect(sameWcRoute(null, { name: WcRouteName.MEETING, params: { roomId: 'r1' } })).toBe(false);
		expect(sameWcRoute({ name: WcRouteName.MEETING, params: { roomId: 'r1' } }, null)).toBe(false);
	});
});
