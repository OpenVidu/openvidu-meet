import { Component, computed, effect, inject, untracked } from '@angular/core';
import { LoggerService, ILogger, OpenViduComponentsUiModule } from 'openvidu-components-angular';
import { CustomParticipantModel } from '../../../models';
import { MeetLayoutService } from '../../../services/layout.service';
import { MeetingContextService } from '../../../services/meeting/meeting-context.service';
import { ShareMeetingLinkComponent } from '../../../components/share-meeting-link/share-meeting-link.component';
import { MeetingService } from '../../../services/meeting/meeting.service';

@Component({
	selector: 'ov-meeting-custom-layout',
	imports: [OpenViduComponentsUiModule, ShareMeetingLinkComponent],
	templateUrl: './meeting-custom-layout.component.html',
	styleUrl: './meeting-custom-layout.component.scss'
})
export class MeetingCustomLayoutComponent {
	private readonly logger: ILogger = inject(LoggerService).get('MeetingCustomLayoutComponent');
	protected readonly layoutService = inject(MeetLayoutService);
	protected readonly meetingContextService = inject(MeetingContextService);
	protected readonly meetingService = inject(MeetingService);

	protected readonly linkOverlayConfig = {
		title: 'Start collaborating',
		subtitle: 'Share this link to bring others into the meeting',
		titleSize: 'xl' as const,
		titleWeight: 'bold' as const
	};

	protected readonly meetingUrl = computed(() => this.meetingContextService.meetingUrl());

	protected readonly shouldShowLinkOverlay = computed(() => {
		const hasNoRemotes = this.meetingContextService.remoteParticipants().length === 0;
		return this.meetingContextService.canModerateRoom() && hasNoRemotes;
	});

	protected readonly isLayoutSwitchingAllowed = this.meetingContextService.allowLayoutSwitching;

	private displayedParticipantIds: string[] = [];

	readonly visibleRemoteParticipants = computed(() => {
		const allRemotes = this.meetingContextService.remoteParticipants();

		if (!this.isSmartMosaicActive()) {
			return allRemotes;
		}

		const participantMap = new Map(allRemotes.map((p) => [p.identity, p]));
		const availableIds = new Set(participantMap.keys());
		const targetIds = this.layoutService.computeParticipantsToDisplay(availableIds);

		this.syncDisplayedParticipantsWithTarget(targetIds, availableIds);

		return this.displayedParticipantIds
			.map((id) => participantMap.get(id))
			.filter((p): p is CustomParticipantModel => p !== undefined);
	});

	constructor() {
		this.setupSpeakerTrackingEffect();
		this.setupParticipantCleanupEffect();
	}

	protected onCopyMeetingLinkClicked(): void {
		const room = this.meetingContextService.meetRoom();
		if (!room) {
			this.logger.e('Cannot copy link: meeting room is undefined');
			return;
		}
		this.meetingService.copyMeetingSpeakerLink(room);
	}

	private isSmartMosaicActive(): boolean {
		return this.isLayoutSwitchingAllowed() && this.layoutService.isSmartMosaicEnabled();
	}

	/**
	 * Synchronizes the list of displayed participants with the target set of participant IDs.
	 * Ensures that only available participants are shown, replaces removed IDs with new ones
	 * when possible, and appends any remaining participants needed to match the target state.
	 * @param targetIds Set of participant IDs that should be displayed.
	 * @param availableIds Set of participant IDs that are currently available for display.
	 */

	private syncDisplayedParticipantsWithTarget(targetIds: Set<string>, availableIds: Set<string>): void {
		this.displayedParticipantIds = this.displayedParticipantIds.filter((id) => availableIds.has(id));

		const currentDisplaySet = new Set(this.displayedParticipantIds);
		const idsToRemove = this.displayedParticipantIds.filter((id) => !targetIds.has(id));
		const idsToAdd = [...targetIds].filter((id) => !currentDisplaySet.has(id));

		// Substitute removed with added at same positions
		for (const removeId of idsToRemove) {
			const addId = idsToAdd.shift();
			if (addId) {
				const index = this.displayedParticipantIds.indexOf(removeId);
				if (index !== -1) this.displayedParticipantIds[index] = addId;
			} else {
				this.displayedParticipantIds = this.displayedParticipantIds.filter((id) => id !== removeId);
			}
		}

		// Append remaining
		for (const addId of idsToAdd) {
			if (this.displayedParticipantIds.length < targetIds.size) {
				this.displayedParticipantIds.push(addId);
			}
		}
	}

	private setupSpeakerTrackingEffect(): void {
		effect(() => {
			const room = this.meetingContextService.lkRoom();
			if (this.isLayoutSwitchingAllowed() && room) {
				this.layoutService.initializeSpeakerTracking(room);
			}
		});
	}

	private setupParticipantCleanupEffect(): void {
		effect(() => {
			if (!this.isSmartMosaicActive()) return;

			const currentIds = new Set(this.meetingContextService.remoteParticipants().map((p) => p.identity));
			untracked(() => this.layoutService.removeDisconnectedSpeakers(currentIds));
		});
	}
}
