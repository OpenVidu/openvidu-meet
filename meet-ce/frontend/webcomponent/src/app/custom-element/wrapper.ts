import {
	EmbeddedCommandName,
	EmbeddedEventName,
	EmbeddedEventPayloadFor,
	MeetParticipantModerationAction,
	MeetParticipantMuteOptions,
	MeetReaction
} from '@openvidu-meet/typings';
import { warnCommandRejected } from '../../command-rejection';
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
			this._run(EmbeddedCommandName.MEETING_END, (app) => app.meetingEnd());
		}

		meetingLeave(): void {
			this._run(EmbeddedCommandName.MEETING_LEAVE, (app) => app.meetingLeave());
		}

		participantKick(participantIdentity: string): void {
			this._run(EmbeddedCommandName.PARTICIPANT_KICK, (app) => app.participantKick(participantIdentity));
		}

		participantMute(participantIdentity: string, media: MeetParticipantMuteOptions): void {
			this._run(EmbeddedCommandName.PARTICIPANT_MUTE, (app) => app.participantMute(participantIdentity, media));
		}

		participantMuteAll(media: MeetParticipantMuteOptions): void {
			this._run(EmbeddedCommandName.PARTICIPANT_MUTE_ALL, (app) => app.participantMuteAll(media));
		}

		participantUpdateRole(participantIdentity: string, action: MeetParticipantModerationAction): void {
			this._run(EmbeddedCommandName.PARTICIPANT_UPDATE_ROLE, (app) =>
				app.participantUpdateRole(participantIdentity, action)
			);
		}

		mediaToggleAudio(active?: boolean): void {
			this._run(EmbeddedCommandName.MEDIA_TOGGLE_AUDIO, (app) => app.mediaToggleAudio(active));
		}

		mediaToggleVideo(active?: boolean): void {
			this._run(EmbeddedCommandName.MEDIA_TOGGLE_VIDEO, (app) => app.mediaToggleVideo(active));
		}

		mediaToggleScreenShare(active?: boolean): void {
			this._run(EmbeddedCommandName.MEDIA_TOGGLE_SCREEN_SHARE, (app) => app.mediaToggleScreenShare(active));
		}

		recordingStart(): void {
			this._run(EmbeddedCommandName.RECORDING_START, (app) => app.recordingStart());
		}

		recordingStop(): void {
			this._run(EmbeddedCommandName.RECORDING_STOP, (app) => app.recordingStop());
		}

		participantHandRaise(): void {
			this._run(EmbeddedCommandName.PARTICIPANT_HAND_RAISE, (app) => app.participantHandRaise());
		}

		participantHandLower(participantIdentity?: string): void {
			this._run(EmbeddedCommandName.PARTICIPANT_HAND_LOWER, (app) =>
				app.participantHandLower(participantIdentity)
			);
		}

		participantHandLowerAll(): void {
			this._run(EmbeddedCommandName.PARTICIPANT_HAND_LOWER_ALL, (app) => app.participantHandLowerAll());
		}

		participantReactionSend(reaction: MeetReaction): void {
			this._run(EmbeddedCommandName.PARTICIPANT_REACTION_SEND, (app) => app.participantReactionSend(reaction));
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

		/** Runs a command on the component, or rejects it with a warning while Meet has not started. */
		private _run(command: EmbeddedCommandName, call: (app: App) => void): void {
			// Accesses Angular Elements internal strategy to reach the component instance.
			const app = (this as any).ngElementStrategy?.componentRef?.instance as App | undefined;

			if (!app) {
				warnCommandRejected(command);
				return;
			}

			call(app);
		}
	}

	return OpenViduMeetElement as unknown as CustomElementConstructor;
}
