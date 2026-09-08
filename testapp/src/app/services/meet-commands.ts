import { inject, Injectable, signal } from '@angular/core';
import { EmbeddedEventName, EmbeddedEventPayloadFor, MeetParticipantMuteOptions } from '@openvidu-meet/typings';
import { Integration, TriState, toOptionalBoolean } from '../models';
import type { OpenViduMeetElement } from '../openvidu-meet-element';
import { EventLogService } from './event-log';
import { IframeHostService } from './iframe-host';

type JoinedHandler = (eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName.JOINED>) => void;

/**
 * Sends the embedded API's commands to whichever transport is mounted, and logs
 * each one. Both transports expose the same command surface — the webcomponent
 * element directly, the iframe through `postMessage` — so every method here is
 * the same call routed two ways.
 *
 * The shared arguments (target identity, muted devices, explicit `active`) live
 * here too, because they belong to the commands rather than to the mount config.
 */
@Injectable({ providedIn: 'root' })
export class MeetCommandsService {
	private readonly iframeHost = inject(IframeHostService);
	private readonly log = inject(EventLogService);

	/** Participant addressed by `participantKick()` and `participantMute()`. */
	readonly participantIdentity = signal('');
	/** Devices the two moderation-mute commands turn off; any combination is a valid request. */
	readonly muteAudio = signal(true);
	readonly muteVideo = signal(false);
	readonly muteScreenShare = signal(false);
	/** Explicit `active` for the media toggles. `''` toggles instead. */
	readonly mediaActive = signal<TriState>('');
	/** Whether an `on("joined")` handler is currently registered. */
	readonly joinedListenerRegistered = signal(false);

	private integration: Integration = 'webcomponent';
	private element: OpenViduMeetElement | null = null;
	private onJoinedHandler: JoinedHandler | null = null;

	/**
	 * Points the commands at the mounted transport. The shell calls this whenever
	 * the integration changes or the element remounts; any handler registered on a
	 * previous element is dropped with it.
	 */
	useTransport(integration: Integration, element: OpenViduMeetElement | null): void {
		if (this.element !== element) {
			this.onJoinedHandler = null;
			this.joinedListenerRegistered.set(false);
		}

		this.integration = integration;
		this.element = element;
	}

	// ── Meeting ─────────────────────────────────────────────────────────────

	meetingEnd(): void {
		this.dispatch(
			() => this.iframeHost.meetingEnd(),
			(element) => element.meetingEnd()
		);
		this.log.command('meetingEnd', '()');
	}

	meetingLeave(): void {
		this.dispatch(
			() => this.iframeHost.meetingLeave(),
			(element) => element.meetingLeave()
		);
		this.log.command('meetingLeave', '()');
	}

	// ── Participant moderation ──────────────────────────────────────────────

	participantKick(): void {
		const identity = this.requireIdentity('participantKick');

		if (!identity) return;

		this.dispatch(
			() => this.iframeHost.participantKick(identity),
			(element) => element.participantKick(identity)
		);
		this.log.command('participantKick', `("${identity}")`);
	}

	participantMute(): void {
		const identity = this.requireIdentity('participantMute');
		const media = this.muteOptions('participantMute');

		if (!identity || !media) return;

		this.dispatch(
			() => this.iframeHost.participantMute(identity, media),
			(element) => element.participantMute(identity, media)
		);
		this.log.command('participantMute', `("${identity}", ${JSON.stringify(media)})`);
	}

	participantMuteAll(): void {
		const media = this.muteOptions('participantMuteAll');

		if (!media) return;

		this.dispatch(
			() => this.iframeHost.participantMuteAll(media),
			(element) => element.participantMuteAll(media)
		);
		this.log.command('participantMuteAll', `(${JSON.stringify(media)})`);
	}

	// ── Local media ─────────────────────────────────────────────────────────

	mediaToggleAudio(): void {
		const active = toOptionalBoolean(this.mediaActive());
		this.dispatch(
			() => this.iframeHost.mediaToggleAudio(active),
			(element) => element.mediaToggleAudio(active)
		);
		this.log.command('mediaToggleAudio', `(${active ?? ''})`);
	}

	mediaToggleVideo(): void {
		const active = toOptionalBoolean(this.mediaActive());
		this.dispatch(
			() => this.iframeHost.mediaToggleVideo(active),
			(element) => element.mediaToggleVideo(active)
		);
		this.log.command('mediaToggleVideo', `(${active ?? ''})`);
	}

	mediaToggleScreenShare(): void {
		const active = toOptionalBoolean(this.mediaActive());
		this.dispatch(
			() => this.iframeHost.mediaToggleScreenShare(active),
			(element) => element.mediaToggleScreenShare(active)
		);
		this.log.command('mediaToggleScreenShare', `(${active ?? ''})`);
	}

	// ── Deprecated 3.8.0 spellings ──────────────────────────────────────────
	// Same actions under the old names, so the e2e can prove a host that never
	// migrates keeps working until 3.12.0.

	/** @deprecated Sends the 3.8.0 `endMeeting` command. Removed in 3.12.0. */
	legacyEndMeeting(): void {
		this.dispatch(
			() => this.iframeHost.legacyEndMeeting(),
			(element) => element.endMeeting()
		);
		this.log.command('endMeeting', '() [deprecated]');
	}

	/** @deprecated Sends the 3.8.0 `leaveRoom` command. Removed in 3.12.0. */
	legacyLeaveRoom(): void {
		this.dispatch(
			() => this.iframeHost.legacyLeaveRoom(),
			(element) => element.leaveRoom()
		);
		this.log.command('leaveRoom', '() [deprecated]');
	}

	/** @deprecated Sends the 3.8.0 `kickParticipant` command. Removed in 3.12.0. */
	legacyKickParticipant(): void {
		const identity = this.requireIdentity('kickParticipant');

		if (!identity) return;

		this.dispatch(
			() => this.iframeHost.legacyKickParticipant(identity),
			(element) => element.kickParticipant(identity)
		);
		this.log.command('kickParticipant', `("${identity}") [deprecated]`);
	}

	// ── on / once / off (webcomponent element only) ─────────────────────────

	registerJoinedListener(): void {
		const element = this.requireElement();

		if (!element) return;

		if (this.onJoinedHandler) {
			this.log.warning('on("joined")', 'a handler is already registered, call off first');
			return;
		}

		this.onJoinedHandler = (payload) => this.log.info('on("joined")', `identity: ${payload.participantIdentity}`);
		element.on(EmbeddedEventName.JOINED, this.onJoinedHandler);
		this.joinedListenerRegistered.set(true);
		this.log.command('on', '("joined", handler)');
	}

	registerJoinedListenerOnce(): void {
		const element = this.requireElement();

		if (!element) return;

		element.once(EmbeddedEventName.JOINED, (payload) =>
			this.log.info('once("joined")', `identity: ${payload.participantIdentity}`)
		);
		this.log.command('once', '("joined", handler)');
	}

	removeJoinedListener(): void {
		const element = this.requireElement();

		if (!element) return;

		if (!this.onJoinedHandler) {
			this.log.warning('off("joined")', 'no handler registered');
			return;
		}

		element.off(EmbeddedEventName.JOINED, this.onJoinedHandler);
		this.onJoinedHandler = null;
		this.joinedListenerRegistered.set(false);
		this.log.command('off', '("joined", handler)');
	}

	private requireElement(): OpenViduMeetElement | null {
		if (this.integration === 'webcomponent' && this.element) return this.element;

		this.log.warning('on / once / off', 'webcomponent only, and no element is mounted');
		return null;
	}

	/** The target identity, or `null` (with a reason in the console) when none is set. */
	private requireIdentity(command: string): string | null {
		const identity = this.participantIdentity().trim();

		if (!identity) {
			this.log.warning(command, 'set a target participant identity');
			return null;
		}

		return identity;
	}

	/**
	 * Builds the one-way mute options the moderation commands carry from the selected
	 * devices, or `null` when none is selected: the API requires at least one.
	 */
	private muteOptions(command: string): MeetParticipantMuteOptions | null {
		const media: MeetParticipantMuteOptions = {};

		if (this.muteAudio()) media.audioActive = false;

		if (this.muteVideo()) media.videoActive = false;

		if (this.muteScreenShare()) media.screenShareActive = false;

		if (Object.keys(media).length === 0) {
			this.log.warning(command, 'select at least one device to mute');
			return null;
		}

		return media;
	}

	private dispatch(onIframe: () => void, onElement: (element: OpenViduMeetElement) => void): void {
		if (this.integration === 'iframe') {
			onIframe();
			return;
		}

		if (this.element) {
			onElement(this.element);
		}
	}
}
