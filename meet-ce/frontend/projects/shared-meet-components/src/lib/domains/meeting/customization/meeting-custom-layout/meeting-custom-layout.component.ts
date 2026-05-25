import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ShareMeetingLinkComponent } from '../../components/share-meeting-link/share-meeting-link.component';
import { OpenViduComponentsUiModule, PanelService, PanelType } from '../../openvidu-components';
import { SmartLayoutComponent } from '../../openvidu-components/components/layout/smart-layout/smart-layout.component';
import { SmartLayoutService } from '../../openvidu-components/services/layout/smart-layout.service';
import { MeetingAccessLinkService } from '../../services/meeting-access-link.service';
import { MeetingCaptionsService } from '../../services/meeting-captions.service';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingLayoutService } from '../../services/meeting-layout.service';
import { MeetingCaptionsComponent } from '../meeting-captions/meeting-captions.component';

@Component({
	selector: 'ov-meeting-custom-layout',
	imports: [
		NgClass,
		OpenViduComponentsUiModule,
		SmartLayoutComponent,
		ShareMeetingLinkComponent,
		MeetingCaptionsComponent
	],
	templateUrl: './meeting-custom-layout.component.html',
	styleUrl: './meeting-custom-layout.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [{ provide: SmartLayoutService, useExisting: MeetingLayoutService }]
})
export class MeetingCustomLayoutComponent {
	protected meetingContextService = inject(MeetingContextService);
	protected meetingAccessLinkService = inject(MeetingAccessLinkService);
	protected captionsService = inject(MeetingCaptionsService);
	protected panelService = inject(PanelService);

	lkRoom = this.meetingContextService.lkRoom;
	meetingUrl = this.meetingAccessLinkService.speakerPublicLink;
	remoteParticipants = this.meetingContextService.remoteParticipants;
	areCaptionsEnabledByUser = this.captionsService.areCaptionsEnabledByUser;
	captions = this.captionsService.captions;
	linkOverlayConfig = {
		title: 'Start collaborating',
		subtitle: 'Share this link to bring others into the meeting',
		titleSize: 'xl' as const,
		titleWeight: 'bold' as const
	};
	shouldShowLinkOverlay = computed(() => {
		const hasNoRemotes = this.remoteParticipants().length === 0;
		const hasPublicSpeakerLink = !!this.meetingUrl();
		return this.meetingContextService.meetingUI().showShareAccessLinks && hasNoRemotes && hasPublicSpeakerLink;
	});

	showLayoutSelector = computed(() => this.meetingContextService.meetingUI().showLayoutSelector);

	protected onCopyMeetingLinkClicked(): void {
		this.meetingAccessLinkService.copyMeetingSpeakerLink();
	}

	protected toggleParticipantsPanel(): void {
		this.panelService.togglePanel(PanelType.PARTICIPANTS);
	}
}
