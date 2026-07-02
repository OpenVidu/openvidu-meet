import type { WebComponentPropertyValues } from '@openvidu-meet/typings';
import { LeftEventReason } from '@openvidu-meet/typings';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { appendQuery, lastPathSegment, queryParam } from '../../../shared/utils/url.utils';
import { WcRoute, WcRouteName } from '../models/wc-route.model';

/**
 * Resolves the host attributes/properties into the initial {@link WcRoute} the shell navigates to
 * — the WC analog of the SPA picking a route from its URL. This is the one place that parses the
 * WC-specific inputs (room/recording URLs + query params) into typed route params; the router and
 * the entry-service guards are URL-agnostic.
 *
 * A present-but-unparseable room/recording URL resolves to {@link WcRouteName.INVALID} with an
 * explanatory message (mirroring the validation the old per-mode bootstrappers did).
 */
export const wcRouteFromAttributes = (inputs: WebComponentPropertyValues): WcRoute => {
	const { roomUrl, recordingUrl, showRecording, showOnlyRecordings } = inputs;

	if (recordingUrl || showRecording) {
		const recordingId = recordingUrl ? lastPathSegment(recordingUrl) : showRecording;

		if (!recordingId) {
			return {
				name: WcRouteName.INVALID,
				params: { message: 'Cannot extract recording ID from "recording-url" or "show-recording".' }
			};
		}

		return {
			name: WcRouteName.SINGLE_RECORDING,
			params: {
				recordingId,
				recordingSecret: recordingUrl ? (queryParam(recordingUrl, 'recordingSecret') ?? undefined) : undefined,
				roomSecret: roomUrl ? (queryParam(roomUrl, 'secret') ?? undefined) : undefined
			}
		};
	}

	if (roomUrl) {
		const roomId = lastPathSegment(roomUrl);

		if (!roomId) {
			return {
				name: WcRouteName.INVALID,
				params: { message: `Invalid room URL: "${roomUrl}". Cannot extract room ID.` }
			};
		}

		if (showOnlyRecordings) {
			return {
				name: WcRouteName.ROOM_RECORDINGS,
				params: { roomId, secret: queryParam(roomUrl, 'secret') ?? undefined }
			};
		}

		return {
			name: WcRouteName.MEETING,
			params: {
				roomId,
				secret: queryParam(roomUrl, 'secret') ?? undefined,
				e2eeKey: inputs.e2eeKey || undefined,
				participantName: inputs.participantName || undefined,
				leaveRedirectUrl: inputs.leaveRedirectUrl || undefined
			}
		};
	}

	return {
		name: WcRouteName.INVALID,
		params: { message: 'Please provide a "room-url" or "recording-url" attribute to embed OpenVidu Meet.' }
	};
};

/**
 * The route-determining identity of an attribute-derived route, used by the shell to decide whether
 * a host-attribute change warrants re-navigation. Ignores non-identity params (secret, e2eeKey,
 * participantName) so a mid-session attribute tweak doesn't yank the user off an interrupt view
 * (login, recordings…) or restart the meeting.
 */
export const wcRouteIdentity = (route: WcRoute): string => {
	switch (route.name) {
		case WcRouteName.MEETING:
		case WcRouteName.ROOM_RECORDINGS:
			return `${route.name}:${route.params.roomId}`;
		case WcRouteName.SINGLE_RECORDING:
			return `${route.name}:${route.params.recordingId}`;
		default:
			return route.name;
	}
};

/**
 * Serializes a {@link WcRoute} to the SPA-equivalent path string. This backs
 * `WcRouterService.currentPath` (the HTTP interceptor's `pageUrl` in webcomponent mode) and is
 * embedded as the login `redirectTo` so it can be parsed back later. Access secrets are kept on the
 * resource routes so a redirect-after-login round-trip preserves them.
 */
export const wcRouteToPath = (route: WcRoute): string | null => {
	switch (route.name) {
		case WcRouteName.MEETING:
			return appendQuery(`/room/${route.params.roomId}`, { secret: route.params.secret });
		case WcRouteName.SINGLE_RECORDING:
			return appendQuery(`/recording/${route.params.recordingId}`, {
				recordingSecret: route.params.recordingSecret,
				roomSecret: route.params.roomSecret
			});
		case WcRouteName.ROOM_RECORDINGS:
			return appendQuery(`/room/${route.params.roomId}/recordings`, { secret: route.params.secret });
		case WcRouteName.LOGIN:
			return appendQuery('/login', { redirectTo: route.params.redirectTo });
		case WcRouteName.CHANGE_PASSWORD:
			return appendQuery('/change-password-required', { redirectTo: route.params.redirectTo });
		case WcRouteName.ERROR:
			return appendQuery('/error', { reason: route.params.reason });
		case WcRouteName.DISCONNECTED:
			return appendQuery('/disconnected', { reason: route.params.reason });
		case WcRouteName.INVALID:
			return null;
	}
};

/**
 * Parses a SPA-style path string back into a {@link WcRoute}. Used to resume the originating view
 * after an in-WC login/password-change completes. Returns `null` for unrecognized paths so the
 * caller can fall back to the home (attribute-derived) route.
 */
export const wcRouteFromPath = (path: string): WcRoute | null => {
	if (!path) {
		return null;
	}

	let url: URL;
	try {
		// Dummy origin lets URL parse an app-relative path with its query string.
		url = new URL(path, 'http://wc.local');
	} catch {
		return null;
	}

	const segments = url.pathname.split('/').filter(Boolean);
	const q = url.searchParams;
	const head = segments[0];

	if (head === 'room' && segments[2] === 'recordings') {
		return {
			name: WcRouteName.ROOM_RECORDINGS,
			params: { roomId: segments[1], secret: q.get('secret') ?? undefined }
		};
	}
	if (head === 'room' && segments[1]) {
		return { name: WcRouteName.MEETING, params: { roomId: segments[1], secret: q.get('secret') ?? undefined } };
	}
	if (head === 'recording' && segments[1]) {
		return {
			name: WcRouteName.SINGLE_RECORDING,
			params: {
				recordingId: segments[1],
				recordingSecret: q.get('recordingSecret') ?? undefined,
				roomSecret: q.get('roomSecret') ?? undefined
			}
		};
	}
	if (head === 'login') {
		return { name: WcRouteName.LOGIN, params: { redirectTo: q.get('redirectTo') ?? undefined } };
	}
	if (head === 'change-password-required') {
		return { name: WcRouteName.CHANGE_PASSWORD, params: { redirectTo: q.get('redirectTo') ?? undefined } };
	}
	if (head === 'error') {
		const reason = (q.get('reason') as NavigationErrorReason) ?? NavigationErrorReason.INTERNAL_ERROR;
		return { name: WcRouteName.ERROR, params: { reason } };
	}
	if (head === 'disconnected') {
		const reason = (q.get('reason') as LeftEventReason) ?? LeftEventReason.UNKNOWN;
		return { name: WcRouteName.DISCONNECTED, params: { reason } };
	}

	return null;
};

/** Structural equality of two routes (same name and deep-equal params). */
export const sameWcRoute = (a: WcRoute | null, b: WcRoute | null): boolean => {
	if (a === b) {
		return true;
	}
	if (!a || !b || a.name !== b.name) {
		return false;
	}
	return JSON.stringify(a.params) === JSON.stringify(b.params);
};
