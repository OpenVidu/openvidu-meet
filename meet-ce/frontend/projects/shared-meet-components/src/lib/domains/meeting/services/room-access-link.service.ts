import { Clipboard } from '@angular/cdk/clipboard';
import { effect, inject, Service, signal } from '@angular/core';
import { MeetRoomAccess } from '@openvidu-meet/typings';
import { NotificationService } from '../../../shared/services/notification.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomService } from '../../rooms/services/room.service';
import { LoggerService } from '../../../shared/services/logger.service';

@Service()
export class RoomAccessLinkService {
	private readonly clipboard = inject(Clipboard);
	private readonly roomService = inject(RoomService);
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly notificationService = inject(NotificationService);
	private readonly loggerService = inject(LoggerService);
	private readonly log = this.loggerService.get('OpenVidu Meet - RoomAccessLinkService');

	private readonly _speakerPublicLink = signal<string | undefined>(undefined);
	private readonly _speakerCopyLink = signal<string | undefined>(undefined);
	private readonly _speakerLinkUnavailable = signal(false);
	private latestRequest = 0;

	/** Readonly signal for the speaker link displayed in the UI */
	readonly speakerPublicLink = this._speakerPublicLink.asReadonly();
	/** Readonly signal for the real speaker link used for copy action */
	readonly speakerCopyLink = this._speakerCopyLink.asReadonly();
	/** Whether there is no speaker link to share: disabled, or beyond the participant's permissions */
	readonly speakerLinkUnavailable = this._speakerLinkUnavailable.asReadonly();

	constructor() {
		// The server decides from every permission which links it returns, so each new token asks again.
		effect(() => {
			const permissions = this.roomMemberContextService.permissions();
			const roomId = this.roomMemberContextService.roomId();

			if (!permissions?.roomShareAccessLinks || !roomId) {
				this.latestRequest++;
				this.clear();
				return;
			}

			void this.refreshSpeakerLinksFromRoom(roomId);
		});
	}

	/**
	 * Refreshes speaker links by requesting room access information. Only the latest request applies
	 * its answer, so a slower answer to earlier permissions never overwrites it.
	 */
	private async refreshSpeakerLinksFromRoom(roomId: string): Promise<void> {
		const request = ++this.latestRequest;

		try {
			const room = await this.roomService.getRoom(roomId, {
				fields: ['access']
			});

			if (request === this.latestRequest) {
				this.setSpeakerLinksFromRoomAccess(room.access);
			}
		} catch (error) {
			this.log.w('Could not refresh speaker links from room access:', error);

			if (request === this.latestRequest) {
				this.clear();
			}
		}
	}

	/**
	 * Sets speaker links from room access information, only while the anonymous speaker access is enabled
	 * and the server returned its URL. The public link is shown in the UI while the speaker link is used
	 * for copy action.
	 */
	private setSpeakerLinksFromRoomAccess(access: MeetRoomAccess): void {
		if (!access.anonymous.speaker.enabled || !access.anonymous.speaker.url) {
			this.clear();
			this._speakerLinkUnavailable.set(true);
			return;
		}

		const publicLink = this.getPublicLinkFromAccessUrl(access.user.url);
		this._speakerLinkUnavailable.set(false);
		this._speakerPublicLink.set(publicLink);
		this._speakerCopyLink.set(access.anonymous.speaker.url);
	}

	/**
	 * Extracts a public-facing link from the full access URL, if available.
	 * This is used for display purposes, while the full speaker link is used for copying.
	 *
	 * @param accessUrl - The full access URL from which to extract the public link
	 * @returns A simplified public link for display, or undefined if the input URL is invalid
	 */
	private getPublicLinkFromAccessUrl(accessUrl: string): string | undefined {
		try {
			const url = new URL(accessUrl);
			return `${url.host}${url.pathname}`;
		} catch (error) {
			this.log.w('Invalid access URL while building public speaker link', error);
			return undefined;
		}
	}

	/**
	 * Copies the room access link (shared anonymous speaker link) to the clipboard when available.
	 */
	async copyRoomAccessLink(): Promise<void> {
		let speakerLink = this._speakerCopyLink();

		if (!speakerLink) {
			const roomId = this.roomMemberContextService.roomId();

			if (roomId) {
				await this.refreshSpeakerLinksFromRoom(roomId);
				speakerLink = this._speakerCopyLink();
			}
		}

		if (!speakerLink) {
			this.log.w('Cannot copy speaker link: link is not available for current permissions');
			return;
		}

		this.clipboard.copy(speakerLink);
		this.notificationService.showMessage('Room access link copied to clipboard');
	}

	clear(): void {
		this._speakerPublicLink.set(undefined);
		this._speakerCopyLink.set(undefined);
		this._speakerLinkUnavailable.set(false);
	}
}
