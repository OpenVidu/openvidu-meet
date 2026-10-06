import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { LoggerService } from '../../../../shared/services/logger.service';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { ParticipantService } from '../../openvidu-components';
import { MeetingHandService } from '../../services/meeting-hand.service';

/**
 * Heads the participants panel, above the local participant, because lowering every hand reaches
 * all of them, yours included. A queue holding only your own hand leaves it out: your row and the
 * toolbar already lower that one.
 */
@Component({
	selector: 'ov-meeting-raised-hands-strip',
	templateUrl: './meeting-raised-hands-strip.component.html',
	styleUrls: ['./meeting-raised-hands-strip.component.scss'],
	imports: [MatButtonModule, MatIconModule, TranslatePipe]
})
export class MeetingRaisedHandsStripComponent {
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly participantService = inject(ParticipantService);
	private readonly meetingHandService = inject(MeetingHandService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - MeetingRaisedHandsStrip');

	readonly raisedHandCount = computed(() => this.participantService.raisedHands().length);
	readonly visible = computed(
		() =>
			this.roomMemberContextService.hasPermission('participantHandLower') &&
			this.participantService.raisedHands().some((participant) => !participant.isLocal)
	);

	async onLowerAllHandsClick(): Promise<void> {
		if (!this.visible()) return;

		try {
			await this.meetingHandService.lowerAll();
		} catch (error) {
			this.log.e('Error lowering every hand:', error);
		}
	}
}
