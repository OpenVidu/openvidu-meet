import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, contentChild, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParticipantPanelParticipantBadgeDirective } from '../../../../directives/template/internals.directive';
import { ParticipantModel } from '../../../../models/participant.model';
import { TranslatePipe } from '../../../../pipes/translate.pipe';
import { OpenViduComponentsConfigService } from '../../../../services/config/directive-config.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { TemplateRegistryService } from '../../../../services/template/template-registry.service';
import { TranslateService } from '../../../../services/translate/translate.service';
import { ConnectionQualityIndicatorComponent } from '../../../connection-quality-indicator/connection-quality-indicator.component';
import { ParticipantAvatarComponent } from '../../../participant-avatar/participant-avatar.component';

/**
 * The **ParticipantPanelItemComponent** is hosted inside of the {@link ParticipantsPanelComponent}.
 * It displays participant information with enhanced UI/UX, including support for custom content
 * injection through structural directives.
 */
@Component({
	selector: 'ov-participant-panel-item',
	imports: [CommonModule, MatButtonModule, MatIconModule, MatListModule, MatTooltipModule, TranslatePipe, ParticipantAvatarComponent, ConnectionQualityIndicatorComponent],
	templateUrl: './participant-panel-item.component.html',
	styleUrls: ['./participant-panel-item.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class ParticipantPanelItemComponent {
	readonly participantInput = input<ParticipantModel | undefined>(undefined, { alias: 'participant' });
	readonly muteButtonInput = input(true, { alias: 'muteButton' });
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly participantService = inject(ParticipantService);
	private readonly templateRegistry = inject(TemplateRegistryService);
	private readonly translateService = inject(TranslateService);

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
	readonly participantPanelItemElementsTemplate = computed(
		() => this.templateRegistry.participantPanelItemElements()
	);
	readonly participantBadgeTemplate = computed(() => this.externalParticipantBadge()?.template);
	readonly isLocalParticipant = computed(() => this.participantInput()?.isLocal || false);
	readonly participantDisplayName = computed(() => this.participantInput()?.name || '');
	readonly hasExternalElements = computed(() => !!this.participantPanelItemElementsTemplate());

	/**
	 * Reactive equivalent of the legacy `tracksPublishedTypes` pipe. Reading
	 * `isCameraEnabled`/`isScreenShareEnabled`/`isMicrophoneEnabled` through the participant
	 * getters registers the model's `_revision` signal as a dependency, so this computed
	 * re-evaluates whenever the participant publishes or unpublishes a track — even while the
	 * panel is already open and the participant reference itself hasn't changed.
	 *
	 * The pipe was pure and only re-ran on input-reference changes, which left the label
	 * stale during a session.
	 */
	readonly tracksDescription = computed(() => {
		const participant = this.participantInput();
		if (!participant) return '';

		const types: string[] = [];
		if (participant.isCameraEnabled) {
			types.push(this.translateService.translate('PANEL.PARTICIPANTS.CAMERA'));
		}
		if (participant.isScreenShareEnabled) {
			types.push(this.translateService.translate('PANEL.PARTICIPANTS.SCREEN'));
		}
		if (participant.isMicrophoneEnabled) {
			types.push(this.translateService.translate('PANEL.PARTICIPANTS.MICROPHONE'));
		}
		if (types.length === 0) {
			return `(${this.translateService.translate('PANEL.PARTICIPANTS.NO_STREAMS')})`;
		}
		return `(${types.join(', ')})`;
	});

	/** Reactive flag tied to the participant's `_revision`, used to toggle the screen-share badge. */
	readonly isScreenSharing = computed(() => !!this.participantInput()?.isScreenShareEnabled);

	get _participant(): ParticipantModel | undefined {
		return this.participantInput();
	}

	/**
	 * Toggles the mute state of a remote participant
	 */
	toggleMuteForcibly() {
		const participant = this._participant;
		if (participant && !participant.isLocal) {
			this.participantService.setRemoteMutedForcibly(participant.sid, !participant.isMutedForcibly);
		}
	}
}
