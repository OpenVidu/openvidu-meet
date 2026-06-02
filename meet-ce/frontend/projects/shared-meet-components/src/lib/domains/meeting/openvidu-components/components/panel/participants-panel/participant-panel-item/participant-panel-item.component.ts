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
	readonly isScreenSharing = computed(() => !!this.participantInput()?.isScreenShareEnabled);
	readonly isMicrophoneOff = computed(() => {
		const participant = this.participantInput();
		return !!participant && !participant.isMicrophoneEnabled;
	});

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
