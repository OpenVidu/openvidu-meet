import { Injectable, inject } from '@angular/core';
import { HTTP_HEADERS } from '../../../shared/constants/http-headers.constants';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { RoomAccessService } from '../../rooms/services/room-access.service';
import { RecordingService } from './recording.service';

/**
 * Route-agnostic parameters describing an attempt to access a single recording.
 *
 * Callers (SPA route guards, future hosts) are responsible for extracting these
 * values from their own input source and handing the resulting object to this
 * service.
 */
export interface RecordingEntryParams {
	/** The recording identifier (format: `<roomId>--<...>`). */
	recordingId: string;
	/** Optional secret for direct recording access (bypasses room permissions). */
	recordingSecret?: string;
	/** Optional room secret seeded into context for room-based access checks. */
	roomSecret?: string;
}

/**
 * Verdict returned by {@link RecordingEntryService.prepare}.
 *
 * Unlike the meeting variant, recording prepare can fail synchronously when
 * the recording identifier doesn't expose the room it belongs to.
 */
export type RecordingEntryDecision = { kind: 'proceed' } | { kind: 'error'; reason: NavigationErrorReason };

/**
 * Outcome of {@link RecordingEntryService.validate} / {@link RecordingEntryService.attempt}.
 *
 * `login-required` signals the caller should redirect to the login flow with a
 * returnTo URL of its choosing — the service is route-agnostic and doesn't know
 * where the user came from.
 */
export type RecordingEntryOutcome =
	| { kind: 'ready' }
	| { kind: 'login-required' }
	| { kind: 'error'; reason: NavigationErrorReason };

/**
 * Use-case service that gates entry to a single recording. The check has two
 * modes that must be tried in sequence:
 *
 * 1. **Room-permission path**: try to generate a room member token with the
 *    `canRetrieveRecordings` permission. Honors normal auth flows.
 * 2. **Recording-secret path**: when a `recordingSecret` is supplied, validate
 *    it by fetching the recording with the secret as proof. This is the path
 *    used by anonymous users with a shared recording link.
 *
 * Both modes may succeed; both may fail. The service composes the two and
 * surfaces a single outcome. Shared by:
 * - {@link extractRecordingParamsGuard} + {@link validateRecordingAccessGuard} (SPA route guards)
 * - Non-router callers (future Web Component recording-playback mode)
 */
@Injectable({ providedIn: 'root' })
export class RecordingEntryService {
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly roomAccessService = inject(RoomAccessService);
	private readonly recordingService = inject(RecordingService);

	/**
	 * Derives the recording's owning room from the recording ID and seeds room
	 * context so subsequent access checks can target it. Performs no network I/O.
	 *
	 * Returns `error` when the recording identifier cannot be parsed.
	 */
	prepare(params: RecordingEntryParams): RecordingEntryDecision {
		const roomId = this.parseRoomId(params.recordingId);
		if (!roomId) {
			console.error('Cannot prepare recording entry: invalid recording ID format');
			return { kind: 'error', reason: NavigationErrorReason.INVALID_RECORDING };
		}

		this.meetingContextService.setRoomId(roomId);
		if (params.roomSecret) {
			this.meetingContextService.setRoomSecret(params.roomSecret, true);
		}

		return { kind: 'proceed' };
	}

	/**
	 * Validates access to the recording using both available proofs (room
	 * permission, recording secret). Assumes context has already been seeded
	 * via {@link prepare} — call {@link attempt} instead for a one-shot flow.
	 */
	async validate({ recordingId, recordingSecret }: RecordingEntryParams): Promise<RecordingEntryOutcome> {
		const roomAccess = await this.roomAccessService.validateAccess({
			requireRecordingsPermission: true,
			// When a recording secret is supplied, the user may be anonymous;
			// suppress global auth recovery so we can fall through to the
			// secret-based check instead of bouncing them to login.
			skipAuthRecoveryOn401: !!recordingSecret
		});

		// Room-permission path is conclusive only when no recording secret is
		// supplied. When a secret IS supplied, we always defer to the secret
		// check — it surfaces secret-specific errors and supports anonymous use.
		if (!recordingSecret) {
			return roomAccess.allowed
				? { kind: 'ready' }
				: { kind: 'error', reason: roomAccess.reason ?? NavigationErrorReason.INTERNAL_ERROR };
		}

		try {
			const headers = { [HTTP_HEADERS.SKIP_AUTH_RECOVERY]: 'true' };
			await this.recordingService.getRecording(recordingId, recordingSecret, headers);
			return { kind: 'ready' };
		} catch (error: any) {
			console.error('Error checking recording access:', error);
			switch (error.status) {
				case 400:
					return { kind: 'error', reason: NavigationErrorReason.INVALID_RECORDING_SECRET };
				case 401:
					return { kind: 'login-required' };
				case 403:
					return { kind: 'error', reason: NavigationErrorReason.ANONYMOUS_RECORDING_ACCESS_DISABLED };
				case 404:
					return { kind: 'error', reason: NavigationErrorReason.INVALID_RECORDING };
				default:
					return { kind: 'error', reason: NavigationErrorReason.INTERNAL_ERROR };
			}
		}
	}

	/**
	 * One-shot orchestrator: prepare context and run the full validation chain.
	 * Intended for non-router callers that want a single awaitable call. Router
	 * adapters typically invoke {@link prepare} and {@link validate} separately
	 * across two guard steps.
	 */
	async attempt(params: RecordingEntryParams): Promise<RecordingEntryOutcome> {
		const decision = this.prepare(params);
		if (decision.kind === 'error') {
			return decision;
		}
		return this.validate(params);
	}

	/**
	 * Recording IDs follow the convention `<roomId>--<...>`. Returns `null` when
	 * the input doesn't expose a room segment.
	 */
	private parseRoomId(recordingId: string): string | null {
		const [roomId] = (recordingId ?? '').split('--');
		return roomId || null;
	}
}
