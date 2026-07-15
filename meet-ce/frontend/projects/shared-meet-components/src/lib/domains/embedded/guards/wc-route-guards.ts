import { Service, inject } from '@angular/core';
import { MeetingEntryService } from '../../meeting/services/meeting-entry.service';
import { RecordingEntryService } from '../../recordings/services/recording-entry.service';
import { RoomRecordingsEntryService } from '../../recordings/services/room-recordings-entry.service';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { MeetingRoute, RoomRecordingsRoute, SingleRecordingRoute, WcRoute, WcRouteName } from '../models/wc-route.model';
import { wcRouteFromPath, wcRouteToPath } from '../utils/wc-route.utils';

/**
 * Outcome of a WC route guard — the webcomponent analog of a SPA `CanActivateFn` returning
 * `true` / a redirect `UrlTree` / a denial.
 */
export type WcGuardResult =
	| { kind: 'ready' }
	| { kind: 'redirect'; to: WcRoute }
	| { kind: 'error'; reason: NavigationErrorReason };

/**
 * Gates entry to a WC route, reusing the SAME entry services as the SPA route guards. One guard
 * per guarded route; {@link WcRouterService} dispatches by route name through a registry (a factory
 * keyed on {@link WcRouteName}) instead of a switch. Each guard attribute-injects its entry service.
 */
export interface WcRouteGuard {
	canActivate(route: WcRoute): Promise<WcGuardResult> | WcGuardResult;
}

/** Meeting route guard — equivalent to the SPA `extractRoomMeetingParamsGuard` + `validateRoomMeetingAccessGuard`. */
@Service()
export class WcMeetingGuard implements WcRouteGuard {
	private readonly meetingEntry = inject(MeetingEntryService);

	async canActivate(route: MeetingRoute): Promise<WcGuardResult> {
		const outcome = await this.meetingEntry.attempt(route.params);
		switch (outcome.kind) {
			case 'ready':
				return { kind: 'ready' };
			case 'redirect': {
				// MeetingEntryService returns an SPA-style path (showRecording / showOnlyRecordings);
				// translate it to a route so the WC honors the redirect like the SPA does.
				const to = wcRouteFromPath(outcome.to);
				return to ? { kind: 'redirect', to } : { kind: 'error', reason: NavigationErrorReason.INTERNAL_ERROR };
			}
			case 'error':
				return { kind: 'error', reason: outcome.reason };
		}
	}
}

/** Single-recording route guard — equivalent to the SPA `extractRecordingParamsGuard` + `validateRecordingAccessGuard`. */
@Service()
export class WcSingleRecordingGuard implements WcRouteGuard {
	private readonly recordingEntry = inject(RecordingEntryService);

	async canActivate(route: SingleRecordingRoute): Promise<WcGuardResult> {
		const outcome = await this.recordingEntry.attempt(route.params);
		switch (outcome.kind) {
			case 'ready':
				return { kind: 'ready' };
			case 'login-required':
				// WC analog of the SPA guard's `redirectToLoginPage(state.url)`: carry the current path so
				// a successful login can resume exactly here.
				return {
					kind: 'redirect',
					to: { name: WcRouteName.LOGIN, params: { redirectTo: wcRouteToPath(route) ?? undefined } }
				};
			case 'error':
				return { kind: 'error', reason: outcome.reason };
		}
	}
}

/** Room-recordings route guard — equivalent to the SPA `extractRoomRecordingsParamsGuard` + `validateRoomRecordingsAccessGuard`. */
@Service()
export class WcRoomRecordingsGuard implements WcRouteGuard {
	private readonly roomRecordingsEntry = inject(RoomRecordingsEntryService);

	async canActivate(route: RoomRecordingsRoute): Promise<WcGuardResult> {
		const outcome = await this.roomRecordingsEntry.attempt(route.params);
		return outcome.kind === 'ready' ? { kind: 'ready' } : { kind: 'error', reason: outcome.reason };
	}
}
