import { Injectable, inject } from '@angular/core';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { NavigationService } from '../../../shared/services/navigation.service';
import { RoomAccessService } from '../../rooms/services/room-access.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { MeetingContextService } from './meeting-context.service';

/**
 * Route-agnostic parameters describing an attempt to enter a meeting room.
 *
 * Callers (SPA route guards, the Angular Elements Web Component, future
 * embeddings) are responsible for extracting these values from their own
 * input source — an `ActivatedRouteSnapshot`, custom element attributes,
 * session storage, etc. — and handing the resulting object to this service.
 */
export interface MeetingEntryParams {
	/** The room identifier. */
	roomId: string;
	/** Room access secret (typically from `?secret=` or an equivalent input). */
	secret?: string;
	/** Optional E2EE key. Only set in context when defined. */
	e2eeKey?: string;
	/** Whether {@link e2eeKey} originated from a URL/input param. */
	e2eeKeyFromUrl?: boolean;
	/** Optional participant display name. Only set in context when defined. */
	participantName?: string;
	/** Whether {@link participantName} originated from a URL/input param. */
	participantNameFromUrl?: boolean;
	/** Optional leave-redirect URL passed to {@link NavigationService}. */
	leaveRedirectUrl?: string;
	/** Request a redirect to `/recording/<id>` instead of the meeting. */
	showRecording?: string;
	/** Request a redirect to `/room/<id>/recordings` instead of the meeting. */
	showOnlyRecordings?: boolean;
}

/**
 * Verdict returned by {@link MeetingEntryService.prepare}: either continue
 * with entry, or short-circuit to a different route.
 */
export type MeetingEntryDecision = { kind: 'proceed' } | { kind: 'redirect'; to: string };

/**
 * Outcome of {@link MeetingEntryService.attempt}: the user can enter, must
 * be redirected, or was denied with a specific reason.
 */
export type MeetingEntryOutcome =
	| { kind: 'ready' }
	| { kind: 'redirect'; to: string }
	| { kind: 'error'; reason: NavigationErrorReason };

/**
 * Use-case service that gates entry to a meeting room: seeds the meeting and
 * room-member context from caller-supplied params, then (optionally) validates
 * room access by generating a preliminary room member token.
 *
 * Single source of truth shared by:
 * - {@link extractRoomMeetingParamsGuard} + {@link validateRoomMeetingAccessGuard} (SPA route guards)
 * - The Angular Elements Web Component (no router; seeds context from custom element inputs)
 */
@Injectable({ providedIn: 'root' })
export class MeetingEntryService {
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly roomAccessService = inject(RoomAccessService);
	private readonly navigationService = inject(NavigationService);

	/**
	 * Populates meeting/room-member context from the supplied params and returns
	 * the entry decision (proceed, or short-circuit redirect for
	 * {@link MeetingEntryParams.showRecording} / {@link MeetingEntryParams.showOnlyRecordings}).
	 * Performs no network I/O.
	 *
	 * Storage fallbacks (e.g. a previously-stored participant name) are NOT done
	 * here. Each adapter restores them from its own storage scope before calling
	 * this — keeping the use case independent of the host's storage layer.
	 */
	prepare({
		leaveRedirectUrl,
		roomId,
		secret,
		showRecording,
		showOnlyRecordings,
		e2eeKey,
		e2eeKeyFromUrl,
		participantName,
		participantNameFromUrl
	}: MeetingEntryParams): MeetingEntryDecision {
		this.navigationService.handleLeaveRedirectUrl(leaveRedirectUrl);

		this.meetingContextService.setRoomId(roomId);
		if (secret) {
			this.meetingContextService.setRoomSecret(secret, true);
		}

		if (showRecording) {
			return { kind: 'redirect', to: `/recording/${showRecording}` };
		}
		if (showOnlyRecordings) {
			return { kind: 'redirect', to: `/room/${roomId}/recordings` };
		}

		if (e2eeKey !== undefined) {
			this.meetingContextService.setE2eeKey(e2eeKey, e2eeKeyFromUrl ?? false);
		}
		if (participantName !== undefined) {
			this.roomMemberContextService.setParticipantName(participantName, participantNameFromUrl ?? false);
		}

		return { kind: 'proceed' };
	}

	/**
	 * One-shot orchestrator equivalent to the SPA guard chain
	 * `extractRoomMeetingParamsGuard` → `validateRoomMeetingAccessGuard`:
	 * prepares the entry, then validates room access. Intended for non-router
	 * callers (Web Component embedding) that need a single awaitable call.
	 */
	async attempt(params: MeetingEntryParams): Promise<MeetingEntryOutcome> {
		const decision = this.prepare(params);
		if (decision.kind === 'redirect') {
			return decision;
		}

		const access = await this.roomAccessService.validateAccess();
		if (access.allowed) {
			return { kind: 'ready' };
		}
		return { kind: 'error', reason: access.reason ?? NavigationErrorReason.INTERNAL_ERROR };
	}
}
