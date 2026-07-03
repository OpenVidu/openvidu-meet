import { Injectable, inject } from '@angular/core';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { RoomAccessService } from '../../rooms/services/room-access.service';

/**
 * Route-agnostic parameters describing an attempt to view the recordings list
 * of a room.
 */
export interface RoomRecordingsEntryParams {
	/** The room identifier. */
	roomId: string;
	/** Optional room secret seeded into context for the access check. */
	secret?: string;
}

/**
 * Verdict returned by {@link RoomRecordingsEntryService.prepare}. Cannot fail
 * synchronously today — the kind is fixed at `proceed` so callers can switch
 * uniformly with the other entry services.
 */
export type RoomRecordingsEntryDecision = { kind: 'proceed' };

/** Outcome of {@link RoomRecordingsEntryService.attempt} / {@link RoomRecordingsEntryService.validate}. */
export type RoomRecordingsEntryOutcome =
	| { kind: 'ready' }
	| { kind: 'error'; reason: NavigationErrorReason };

/**
 * Use-case service that gates entry to a room's recordings list. Equivalent to
 * the SPA's `extractRoomRecordingsParamsGuard` + `validateRoomRecordingsAccessGuard`
 * chain, but route-agnostic so non-router callers can reuse it.
 *
 * Smaller than its meeting/single-recording siblings because the flow only
 * needs context seeding and a room-permission check with `canRetrieveRecordings`.
 */
@Injectable({ providedIn: 'root' })
export class RoomRecordingsEntryService {
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly roomAccessService = inject(RoomAccessService);

	/**
	 * Seeds room context. Performs no network I/O.
	 */
	prepare(params: RoomRecordingsEntryParams): RoomRecordingsEntryDecision {
		this.meetingContextService.setRoomId(params.roomId);
		// Prefer the caller-supplied secret; otherwise restore the one persisted on
		// this origin, so every adapter (route guard, Web Component) shares the
		// fallback without re-implementing it.
		if (params.secret) {
			this.meetingContextService.setRoomSecret(params.secret, true);
		} else {
			this.meetingContextService.loadRoomSecretFromStorage();
		}
		return { kind: 'proceed' };
	}

	/**
	 * Validates that the caller can list this room's recordings. Assumes context
	 * has already been seeded via {@link prepare}.
	 */
	async validate(): Promise<RoomRecordingsEntryOutcome> {
		const access = await this.roomAccessService.validateAccess({ requireRecordingsPermission: true });
		if (access.allowed) {
			return { kind: 'ready' };
		}
		return { kind: 'error', reason: access.reason ?? NavigationErrorReason.INTERNAL_ERROR };
	}

	/**
	 * One-shot orchestrator for non-router callers: prepare + validate.
	 */
	async attempt(params: RoomRecordingsEntryParams): Promise<RoomRecordingsEntryOutcome> {
		this.prepare(params);
		return this.validate();
	}
}
