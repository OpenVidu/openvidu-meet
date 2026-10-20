import {
	EmbeddedEventName,
	EmbeddedEventPayloadFor,
	MeetParticipantModerationAction,
	MeetParticipantMuteOptions,
	MeetReaction
} from '@openvidu-meet/typings';
import { EventListeners } from '../../event-listeners';
import type { App } from '../app';

/**
 * Wraps the Angular Elements base class to add the imperative command methods (plus the
 * deprecated 3.8.0 spellings of the renamed ones) and the convenience event API (on/once/off).
 */
export function createOpenViduMeetElementClass(
	NgElementConstructor: CustomElementConstructor
): CustomElementConstructor {
	// Declared, not returned as a class expression: mutation testing does not instrument inside one.
	class OpenViduMeetElement extends (NgElementConstructor as any) {
		private readonly _listeners = new EventListeners(this as unknown as HTMLElement);

		disconnectedCallback(): void {
			super.disconnectedCallback?.();
			this._listeners.clear();
		}

		on(
			eventName: EmbeddedEventName,
			callback: (eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName>) => void
		): this {
			this._listeners.add(eventName, callback);
			return this;
		}

		once(
			eventName: EmbeddedEventName,
			callback: (eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName>) => void
		): this {
			this._listeners.add(eventName, callback, true);
			return this;
		}

		off(
			eventName: EmbeddedEventName,
			callback?: (eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName>) => void
		): this {
			this._listeners.remove(eventName, callback);
			return this;
		}

		meetingEnd(): void {
			this._getComponentInstance()?.meetingEnd();
		}

		meetingLeave(): void {
			this._getComponentInstance()?.meetingLeave();
		}

		participantKick(participantIdentity: string): void {
			this._getComponentInstance()?.participantKick(participantIdentity);
		}

		participantMute(participantIdentity: string, media: MeetParticipantMuteOptions): void {
			this._getComponentInstance()?.participantMute(participantIdentity, media);
		}

		participantMuteAll(media: MeetParticipantMuteOptions): void {
			this._getComponentInstance()?.participantMuteAll(media);
		}

		participantUpdateRole(participantIdentity: string, action: MeetParticipantModerationAction): void {
			this._getComponentInstance()?.participantUpdateRole(participantIdentity, action);
		}

		mediaToggleAudio(active?: boolean): void {
			this._getComponentInstance()?.mediaToggleAudio(active);
		}

		mediaToggleVideo(active?: boolean): void {
			this._getComponentInstance()?.mediaToggleVideo(active);
		}

		mediaToggleScreenShare(active?: boolean): void {
			this._getComponentInstance()?.mediaToggleScreenShare(active);
		}

		recordingStart(): void {
			this._getComponentInstance()?.recordingStart();
		}

		recordingStop(): void {
			this._getComponentInstance()?.recordingStop();
		}

		participantHandRaise(): void {
			this._getComponentInstance()?.participantHandRaise();
		}

		participantHandLower(participantIdentity?: string): void {
			this._getComponentInstance()?.participantHandLower(participantIdentity);
		}

		participantHandLowerAll(): void {
			this._getComponentInstance()?.participantHandLowerAll();
		}

		participantReactionSend(reaction: MeetReaction): void {
			this._getComponentInstance()?.participantReactionSend(reaction);
		}

		// ── Deprecated method aliases ────────────────────────────────────────
		// Kept on the element (the public surface) rather than on the component, and routed
		// through the canonical method so both spellings share exactly one path.

		/** @deprecated Renamed to `meetingEnd()`. Removed in 3.12.0. */
		endMeeting(): void {
			this.meetingEnd();
		}

		/** @deprecated Renamed to `meetingLeave()`. Removed in 3.12.0. */
		leaveRoom(): void {
			this.meetingLeave();
		}

		/** @deprecated Renamed to `participantKick()`. Removed in 3.12.0. */
		kickParticipant(participantIdentity: string): void {
			this.participantKick(participantIdentity);
		}

		private _getComponentInstance(): App | null {
			// Accesses Angular Elements internal strategy to reach the component instance.
			const strategy = (this as any).ngElementStrategy;
			const instance = strategy?.componentRef?.instance as App | undefined;
			return instance ?? null;
		}
	}

	return OpenViduMeetElement as unknown as CustomElementConstructor;
}
