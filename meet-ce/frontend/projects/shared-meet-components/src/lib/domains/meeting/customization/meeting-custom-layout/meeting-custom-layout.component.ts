import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { ShareRoomAccessLinkComponent } from '../../components/share-room-access-link/share-room-access-link.component';
import { OpenViduComponentsUiModule, PanelService, PanelType } from '../../openvidu-components';
import { SmartLayoutComponent } from '../../openvidu-components/components/layout/smart-layout/smart-layout.component';
import { SmartLayoutService } from '../../openvidu-components/services/layout/smart-layout.service';
import { RoomAccessLinkService } from '../../services/room-access-link.service';
import { MeetingCaptionsService } from '../../services/meeting-captions.service';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingLayoutService } from '../../services/meeting-layout.service';
import { MeetingCaptionsComponent } from '../meeting-captions/meeting-captions.component';
import { MeetingWaitingPanelComponent } from '../meeting-waiting-panel/meeting-waiting-panel.component';

@Component({
	selector: 'ov-meeting-custom-layout',
	imports: [
		NgClass,
		OpenViduComponentsUiModule,
		SmartLayoutComponent,
		ShareRoomAccessLinkComponent,
		MeetingCaptionsComponent,
		MeetingWaitingPanelComponent
	],
	templateUrl: './meeting-custom-layout.component.html',
	styleUrl: './meeting-custom-layout.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [{ provide: SmartLayoutService, useExisting: MeetingLayoutService }]
})
export class MeetingCustomLayoutComponent {
	protected meetingContextService = inject(MeetingContextService);
	protected roomAccessLinkService = inject(RoomAccessLinkService);
	protected captionsService = inject(MeetingCaptionsService);
	protected panelService = inject(PanelService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);

	lkRoom = this.meetingContextService.lkRoom;
	roomAccessUrl = this.roomAccessLinkService.speakerPublicLink;
	areCaptionsEnabledByUser = this.captionsService.areCaptionsEnabledByUser;
	captions = this.captionsService.captions;
	isEmbeddedMode = this.runtimeConfigService.isEmbeddedMode;
	linkOverlayConfig = {
		title: 'Start collaborating',
		subtitle: 'Share this link to bring others into the meeting',
		titleSize: 'xl' as const,
		titleWeight: 'bold' as const
	};

	/**
	 * Share/copy link overlay: standalone SPA only.
	 */
	shouldShowLinkOverlay = computed(() => {
		const hasPublicSpeakerLink = !!this.roomAccessUrl();
		return (
			!this.isEmbeddedMode() &&
			this.meetingContextService.meetingUI().showShareAccessLinks &&
			this.meetingContextService.isAlone() &&
			hasPublicSpeakerLink
		);
	});

	/**
	 * Waiting overlay: embedded modes (webcomponent or iframe) only, shown while alone
	 * in place of the share/copy link overlay (link sharing is handled by the host application).
	 */
	shouldShowWaitingOverlay = computed(() => this.isEmbeddedMode() && this.meetingContextService.isAlone());

	/** True when either overlay covers the layout (used to hide the hidden-participants indicator). */
	shouldShowOverlay = computed(() => this.shouldShowLinkOverlay() || this.shouldShowWaitingOverlay());

	showLayoutSelector = computed(() => this.meetingContextService.meetingUI().showLayoutSelector);

	protected onCopyRoomAccessLinkClicked(): void {
		this.roomAccessLinkService.copyRoomAccessLink();
	}

	protected toggleParticipantsPanel(): void {
		this.panelService.togglePanel(PanelType.PARTICIPANTS);
	}
}
