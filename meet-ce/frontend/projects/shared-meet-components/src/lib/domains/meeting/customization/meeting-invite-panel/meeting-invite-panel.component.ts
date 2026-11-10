import { Component, computed, inject } from '@angular/core';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { ShareRoomAccessLinkComponent } from '../../components/share-room-access-link/share-room-access-link.component';
import { RoomAccessLinkService } from '../../services/room-access-link.service';
import { MeetingContextService } from '../../services/meeting-context.service';

/**
 * Heads the participants panel with the room access link, in the standalone app only: embedded, the
 * host app shares the link.
 */
@Component({
	selector: 'ov-meeting-invite-panel',
	templateUrl: './meeting-invite-panel.component.html',
	styleUrls: ['./meeting-invite-panel.component.scss'],
	imports: [ShareRoomAccessLinkComponent]
})
export class MeetingInvitePanelComponent {
	protected meetingContextService = inject(MeetingContextService);
	protected roomAccessLinkService = inject(RoomAccessLinkService);
	private readonly isEmbeddedMode = inject(RuntimeConfigService).isEmbeddedMode;

	roomAccessUrl = this.roomAccessLinkService.speakerPublicLink;
	showShareLink = computed(
		() =>
			!this.isEmbeddedMode() &&
			this.meetingContextService.meetingUI().showShareAccessLinks &&
			!!this.roomAccessUrl()
	);

	onCopyClicked(): void {
		this.roomAccessLinkService.copyRoomAccessLink();
	}
}
