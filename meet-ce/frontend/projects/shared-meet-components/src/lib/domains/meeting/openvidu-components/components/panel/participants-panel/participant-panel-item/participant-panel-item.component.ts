import { LowerCasePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, contentChild, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParticipantPanelParticipantBadgeDirective } from '../../../../directives/template/internals.directive';
import { ParticipantPanelItemElementsDirective } from '../../../../directives/template/openvidu-components-angular.directive';
import { ParticipantMediaKind, ParticipantModel } from '../../../../models/participant.model';
import { TranslatePipe } from '../../../../pipes/translate.pipe';
import { MeetingUiConfigService } from '../../../../services/config/meeting-ui-config.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { TemplateRegistryService } from '../../../../services/template/template-registry.service';
import { ConnectionQualityIndicatorComponent } from '../../../connection-quality-indicator/connection-quality-indicator.component';
import { ParticipantAvatarComponent } from '../../../participant-avatar/participant-avatar.component';

/** What a device button reports when it reports anything at all. */
type MediaControlState = 'active' | 'off';

/** How a device reads while it has something to say. */
export interface ParticipantMediaFace {
	icon: string;
	state: MediaControlState;
	labelKey: string;
	actionable: boolean;
}

/**
 * One device in a participant row. `face` is absent when the device has nothing worth reporting, and
 * then nothing is drawn at all: the zone keeps its width so the name still truncates at the same
 * point, and the slack falls at the far end, next to the name, where it reads as spacing.
 */
export interface ParticipantMediaControl {
	kind: ParticipantMediaKind;
	id: string;
	face?: ParticipantMediaFace;
}

interface MediaControlDescriptor {
	kind: ParticipantMediaKind;
	idPrefix: string;
	isLive: (participant: ParticipantModel) => boolean;
	active: { icon: string; labelKey: string };
	/** Absent for a device whose inactive state is not worth saying out loud. */
	off?: { icon: string; labelKey: string };
	actionLabelKey: string;
}

/**
 * The three device slots a row carries. A device that is off is never actionable: the mute API only
 * turns devices off, so nobody can turn one back on.
 */
const MEDIA_CONTROLS: MediaControlDescriptor[] = [
	{
		// Positive only, unlike a microphone or a camera: almost nobody is sharing at any moment, so
		// reporting "not sharing" on every row would be noise rather than information. It leads the
		// group because the group is anchored to the right — the one item that can be absent has to
		// sit furthest from that anchor, or its absence would drag the others along.
		kind: 'screenShare',
		idPrefix: 'stop-screen-share-btn',
		isLive: (participant) => participant.isScreenShareEnabled,
		active: { icon: 'screen_share', labelKey: 'PANEL.PARTICIPANTS.SHARING_SCREEN' },
		actionLabelKey: 'PANEL.PARTICIPANTS.STOP_SCREEN_SHARE'
	},
	{
		kind: 'audio',
		idPrefix: 'mute-audio-btn',
		isLive: (participant) => participant.isMicrophoneEnabled,
		active: { icon: 'mic', labelKey: 'PANEL.PARTICIPANTS.MIC_ON' },
		off: { icon: 'mic_off', labelKey: 'PANEL.PARTICIPANTS.MIC_OFF' },
		actionLabelKey: 'PANEL.PARTICIPANTS.MUTE_MICROPHONE'
	},
	{
		kind: 'video',
		idPrefix: 'mute-video-btn',
		isLive: (participant) => participant.isCameraEnabled,
		active: { icon: 'videocam', labelKey: 'PANEL.PARTICIPANTS.CAM_ON' },
		off: { icon: 'videocam_off', labelKey: 'PANEL.PARTICIPANTS.CAM_OFF' },
		actionLabelKey: 'PANEL.PARTICIPANTS.TURN_OFF_CAMERA'
	}
];

/**
 * The **ParticipantPanelItemComponent** is hosted inside of the {@link ParticipantsPanelComponent}.
 *
 * Each row carries the participant's microphone, camera and screen share as three always-present
 * buttons that read the same way: the colour says whether the device is on or off, and the hover
 * affordance says whether {@link canMuteMedia} lets you turn it off. Anything else a host wants to
 * offer — role changes, removal — is projected into the row's menu through
 * `*ovParticipantPanelItemElements`.
 */
@Component({
	selector: 'ov-participant-panel-item',
	imports: [
		MatButtonModule,
		MatDividerModule,
		MatIconModule,
		MatMenuModule,
		MatTooltipModule,
		TranslatePipe,
		ParticipantAvatarComponent,
		ConnectionQualityIndicatorComponent,
		LowerCasePipe,
		NgTemplateOutlet
	],
	templateUrl: './participant-panel-item.component.html',
	styleUrls: ['./participant-panel-item.component.scss']
})
export class ParticipantPanelItemComponent {
	readonly participantInput = input<ParticipantModel | undefined>(undefined, { alias: 'participant' });

	/**
	 * Whether the viewer may turn off this participant's live devices. Off devices stay inert
	 * regardless: they cannot be turned back on.
	 */
	readonly canMuteMedia = input(false);

	/** Emitted when the viewer activates one of the device buttons. */
	readonly mediaMuteRequested = output<ParticipantMediaKind>();

	private readonly libService = inject(MeetingUiConfigService);
	private readonly participantService = inject(ParticipantService);
	private readonly templateRegistry = inject(TemplateRegistryService);

	/**
	 * @ignore
	 */
	readonly showMuteButton = this.libService.participantItemMuteButtonSignal;
	/**
	 * @ignore
	 */
	readonly showAudioDetection = this.libService.displayAudioDetectionSignal;

	/**
	 * @ignore
	 */
	readonly externalParticipantBadge = contentChild(ParticipantPanelParticipantBadgeDirective);
	readonly externalParticipantPanelItemElements = contentChild(ParticipantPanelItemElementsDirective);
	readonly participantPanelItemElementsTemplate = computed(
		() =>
			this.externalParticipantPanelItemElements()?.template ??
			this.templateRegistry.participantPanelItemElements()
	);
	readonly participantBadgeTemplate = computed(() => this.externalParticipantBadge()?.template);
	readonly isLocalParticipant = computed(() => this.participantInput()?.isLocal || false);
	readonly participantDisplayName = computed(() => this.participantInput()?.name || '');
	readonly hasExternalElements = computed(() => !!this.participantPanelItemElementsTemplate());

	/** Silencing a remote participant is a private preference, so it never applies to yourself. */
	readonly canMuteLocally = computed(() => !this.isLocalParticipant() && this.showMuteButton());
	readonly isMutedLocally = computed(() => !!this.participantInput()?.isMutedForcibly);
	readonly hasMenu = computed(() => this.canMuteLocally() || this.hasExternalElements());

	readonly mediaControls = computed<ParticipantMediaControl[]>(() => {
		const participant = this.participantInput();

		if (!participant) return [];

		const canMute = this.canMuteMedia();

		return MEDIA_CONTROLS.map((control) => {
			const live = control.isLive(participant);
			const face = live ? control.active : control.off;
			const actionable = live && canMute;

			return {
				kind: control.kind,
				id: `${control.idPrefix}-${participant.sid}`,
				face: face && {
					icon: face.icon,
					state: live ? ('active' as const) : ('off' as const),
					labelKey: actionable ? control.actionLabelKey : face.labelKey,
					actionable
				}
			};
		});
	});

	get _participant(): ParticipantModel | undefined {
		return this.participantInput();
	}

	requestMediaMute(kind: ParticipantMediaKind) {
		this.mediaMuteRequested.emit(kind);
	}

	/**
	 * Silences a remote participant for this viewer only.
	 */
	toggleMuteForcibly() {
		const participant = this._participant;

		if (participant && !participant.isLocal) {
			this.participantService.setRemoteMutedForcibly(participant.sid, !participant.isMutedForcibly);
		}
	}
}
