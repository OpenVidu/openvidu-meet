import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetParticipantMuteOptions } from '@openvidu-meet/typings';
import { LoggerService } from '../../../../shared/services/logger.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { ParticipantModel, ParticipantService } from '../../openvidu-components';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingModerationService } from '../../services/meeting-moderation.service';

/** One device the strip can turn off across the room. */
interface BulkAction {
	id: string;
	icon: string;
	enabled: boolean;
	labelKey: string;
	media: MeetParticipantMuteOptions;
}

/**
 * The three devices, in the same order as a participant row, so each button heads its column. Each
 * carries the glyph of what it does rather than of what it reports: a row says what is, this says
 * what will happen. Unlike a row, all three are always here: they are verbs, and "nothing left to
 * stop" is worth saying.
 */
const BULK_ACTIONS = [
	{
		id: 'stop-all-screen-shares-btn',
		icon: 'stop_screen_share',
		isLive: (participant: ParticipantModel) => participant.isScreenShareEnabled,
		labelKey: 'PARTICIPANTS_PANEL_ACTIONS.STOP_ALL_SCREEN_SHARES_TOOLTIP',
		idleLabelKey: 'PARTICIPANTS_PANEL_ACTIONS.STOP_ALL_SCREEN_SHARES_NONE',
		media: { screenShareActive: false } as MeetParticipantMuteOptions
	},
	{
		id: 'mute-all-participants-btn',
		icon: 'mic_off',
		isLive: (participant: ParticipantModel) => participant.isMicrophoneEnabled,
		labelKey: 'PARTICIPANTS_PANEL_ACTIONS.MUTE_ALL_TOOLTIP',
		idleLabelKey: 'PARTICIPANTS_PANEL_ACTIONS.MUTE_ALL_NONE',
		media: { audioActive: false } as MeetParticipantMuteOptions
	},
	{
		id: 'mute-all-cameras-btn',
		icon: 'videocam_off',
		isLive: (participant: ParticipantModel) => participant.isCameraEnabled,
		labelKey: 'PARTICIPANTS_PANEL_ACTIONS.TURN_OFF_ALL_CAMERAS_TOOLTIP',
		idleLabelKey: 'PARTICIPANTS_PANEL_ACTIONS.TURN_OFF_ALL_CAMERAS_NONE',
		media: { videoActive: false } as MeetParticipantMuteOptions
	}
];

/**
 * Panel-wide moderation, sitting after the local participant at the head of the remote list it acts
 * on. Never touches your own devices, and the API leaves moderators alone too.
 */
@Component({
	selector: 'ov-meeting-participants-panel-actions',
	templateUrl: './meeting-participants-panel-actions.component.html',
	styleUrls: ['./meeting-participants-panel-actions.component.scss'],
	imports: [MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe]
})
export class MeetingParticipantsPanelActionsComponent {
	protected roomMemberContextService = inject(RoomMemberContextService);
	protected meetingContextService = inject(MeetingContextService);
	protected meetingModerationService = inject(MeetingModerationService);
	protected participantService = inject(ParticipantService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingParticipantsPanelActions');

	readonly canMuteAll = computed(() => this.roomMemberContextService.hasPermission('participantMute'));

	/** Who a bulk action actually reaches: the API skips moderators and the caller. */
	private readonly targets = computed(() =>
		this.participantService.remoteParticipants().filter((participant) => !participant.hasBadge())
	);

	readonly bulkActions = computed<BulkAction[]>(() => {
		const targets = this.targets();

		return BULK_ACTIONS.map((action) => {
			const enabled = targets.some(action.isLive);

			return {
				id: action.id,
				icon: action.icon,
				enabled,
				labelKey: enabled ? action.labelKey : action.idleLabelKey,
				media: action.media
			};
		});
	});

	async onBulkActionClick(action: BulkAction): Promise<void> {
		if (!this.canMuteAll()) return;

		const roomId = this.meetingContextService.roomId();

		if (!roomId) {
			this.log.e('Cannot turn off media for every participant: room ID is undefined');
			return;
		}

		try {
			await this.meetingModerationService.muteAllParticipants(roomId, action.media);
			this.log.d('Turned off media for every participant successfully');
		} catch (error) {
			this.log.e('Error turning off media for every participant:', error);
		}
	}
}
