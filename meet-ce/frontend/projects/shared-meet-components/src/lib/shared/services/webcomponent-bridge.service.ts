import { inject, Injectable, signal } from '@angular/core';
import { LeftEventReason } from '@openvidu-meet/typings';
import { LoggerService } from '../../domains/meeting/openvidu-components';

/**
 * Payload for the `joined` event surfaced to the webcomponent host.
 */
export interface MeetingJoinedEventDetail {
	roomId: string;
	participantIdentity: string;
}

/**
 * Payload for the `left` event surfaced to the webcomponent host. Carries the
 * precise {@link LeftEventReason} so hosts can distinguish voluntary leaves
 * from network drops, kicks, server shutdowns, etc.
 */
export interface MeetingLeftEventDetail {
	roomId: string;
	participantIdentity: string;
	reason: LeftEventReason;
}

/**
 * Payload for the `closed` event surfaced to the webcomponent host. Empty by
 * contract — `closed` is a pure lifecycle signal: the WC has finished its
 * post-meeting/post-recording flow and the host can unmount the element or
 * follow the configured leave-redirect URL.
 *
 * Internally we carry a monotonically-increasing nonce so consecutive
 * `emitClosedEvent()` calls always produce a new signal reference (the
 * payload itself has no observable fields).
 */
export interface MeetingClosedEventDetail {
	/** @internal Forces signal-equality to detect each emission as a change. */
	_nonce: number;
}

/**
 * Internal request from shared domain code asking the webcomponent shell to
 * swap its rendered view to the room-recordings page. Replaces the SPA's
 * router navigation to `/room/<id>/recordings`, which has no equivalent in
 * the WC (no Angular Router).
 */
export interface ViewRecordingsRequestDetail {
	/** The room whose recordings should be listed. */
	roomId: string;
	/** @internal Forces signal-equality to detect each emission as a change. */
	_nonce: number;
}

/**
 * Internal request from shared domain code asking the webcomponent shell to
 * leave the room-recordings view and return to the meeting/lobby for the
 * given room. Replaces the SPA's router navigation to `/room/<id>`.
 *
 * Whether the shell can actually surface a meeting view depends on how the
 * host launched the WC (e.g. with `room-url`); when it can't, the shell
 * falls back to emitting the public `closed` event so the host can react.
 */
export interface BackToRoomRequestDetail {
	/** The room the user wants to return to. */
	roomId: string;
	/** @internal Forces signal-equality to detect each emission as a change. */
	_nonce: number;
}

/**
 * Plumbing between the shared library and the Angular Elements
 * `<openvidu-meet>` webcomponent shell. Owns the signal-based event bus
 * that lets domain code request shell-level actions (host DOM events to
 * dispatch, internal view swaps to perform) without depending on the
 * Angular Router — which the WC has none of.
 *
 * Direction of flow:
 * - **Outbound (domain → host):** `joinedEvent`, `leftEvent`, `closedEvent`.
 *   The webcomponent shell observes these and re-emits them as DOM
 *   `CustomEvent`s on the custom element.
 * - **Internal (domain → shell):** `viewRecordingsRequest`, `backToRoomRequest`.
 *   The shell observes these and swaps which sub-component it renders;
 *   these are not surfaced as public DOM events.
 *
 * Meeting-specific imperative commands (`endMeeting`, `leaveRoom`,
 * `kickParticipant`) live separately on
 * `MeetingWebComponentManagerService`, which depends on the meeting domain.
 * Splitting them keeps this service in `shared/` and free of domain deps.
 */
@Injectable({
	providedIn: 'root'
})
export class WebComponentBridgeService {
	private readonly log = inject(LoggerService).get('WebComponentBridgeService');

	private readonly _joinedEvent = signal<MeetingJoinedEventDetail | null>(null);
	private readonly _leftEvent = signal<MeetingLeftEventDetail | null>(null);
	private readonly _closedEvent = signal<MeetingClosedEventDetail | null>(null);
	private _closedNonce = 0;
	private readonly _viewRecordingsRequest = signal<ViewRecordingsRequestDetail | null>(null);
	private _viewRecordingsNonce = 0;
	private readonly _backToRoomRequest = signal<BackToRoomRequestDetail | null>(null);
	private _backToRoomNonce = 0;

	/**
	 * Last `joined` payload, or `null` if the local participant has not joined
	 * yet in this session. The webcomponent observes this and dispatches the
	 * public `joined` DOM event. A new object reference is allocated on every
	 * emit so re-joins with identical room/identity still trigger the host
	 * effect.
	 */
	readonly joinedEvent = this._joinedEvent.asReadonly();

	/**
	 * Last `left` payload, or `null` if no leave has occurred yet in this
	 * session.
	 */
	readonly leftEvent = this._leftEvent.asReadonly();

	/**
	 * Last `closed` payload, or `null` until the WC has finished its
	 * post-meeting flow. Re-emissions yield a fresh reference even though the
	 * public payload is empty.
	 */
	readonly closedEvent = this._closedEvent.asReadonly();

	/**
	 * Last `view recordings` request, or `null` if none has been requested in
	 * this session. The webcomponent shell observes this and swaps its
	 * rendered view to the room-recordings page for the supplied roomId.
	 *
	 * Internal plumbing only; not a public DOM event.
	 */
	readonly viewRecordingsRequest = this._viewRecordingsRequest.asReadonly();

	/**
	 * Last `back to room` request, or `null` if none has been requested in
	 * this session. The webcomponent shell observes this and swaps back to
	 * the meeting/lobby view (when it can — see {@link BackToRoomRequestDetail}).
	 *
	 * Internal plumbing only; not a public DOM event.
	 */
	readonly backToRoomRequest = this._backToRoomRequest.asReadonly();

	emitJoinedEvent(detail: MeetingJoinedEventDetail): void {
		this.log.d('Emitting joined event', detail);
		this._joinedEvent.set({ ...detail });
	}

	emitLeftEvent(detail: MeetingLeftEventDetail): void {
		this.log.d('Emitting left event', detail);
		this._leftEvent.set({ ...detail });
	}

	emitClosedEvent(): void {
		this.log.d('Emitting closed event');
		this._closedEvent.set({ _nonce: ++this._closedNonce });
	}

	/**
	 * Requests the WC shell to render the room-recordings view for the given
	 * room. Mirrors what `router.navigate(['/room/<id>/recordings'])` does in
	 * the SPA.
	 */
	emitViewRecordingsRequest(roomId: string): void {
		this.log.d('Emitting viewRecordings request', { roomId });
		this._viewRecordingsRequest.set({ roomId, _nonce: ++this._viewRecordingsNonce });
	}

	/**
	 * Requests the WC shell to leave the recordings view and return to the
	 * room's meeting/lobby. Mirrors what `router.navigate(['/room/<id>'])`
	 * does in the SPA.
	 */
	emitBackToRoomRequest(roomId: string): void {
		this.log.d('Emitting backToRoom request', { roomId });
		this._backToRoomRequest.set({ roomId, _nonce: ++this._backToRoomNonce });
	}
}
