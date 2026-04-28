import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, contentChild, inject, input, TemplateRef } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParticipantPanelParticipantBadgeDirective } from '../../../../directives/template/internals.directive';
import { ParticipantPanelItemElementsDirective } from '../../../../directives/template/openvidu-components-angular.directive';
import { ParticipantModel } from '../../../../models/participant.model';
import { TrackPublishedTypesPipe } from '../../../../pipes/participant.pipe';
import { TranslatePipe } from '../../../../pipes/translate.pipe';
import { OpenViduComponentsConfigService } from '../../../../services/config/directive-config.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { ParticipantPanelItemTemplateConfiguration, TemplateManagerService } from '../../../../services/template/template-manager.service';

/**
 * The **ParticipantPanelItemComponent** is hosted inside of the {@link ParticipantsPanelComponent}.
 * It displays participant information with enhanced UI/UX, including support for custom content
 * injection through structural directives.
 */
@Component({
	selector: 'ov-participant-panel-item',
	imports: [CommonModule, MatButtonModule, MatIconModule, MatListModule, MatTooltipModule, TranslatePipe, TrackPublishedTypesPipe],
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
	private readonly templateManagerService = inject(TemplateManagerService);

	/**
	 * @ignore
	 */
	readonly participantPanelItemElementsTemplateQuery = contentChild('participantPanelItemElements', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly showMuteButton = this.libService.participantItemMuteButtonSignal;

	/**
	 * @ignore
	 */
	readonly externalItemElements = contentChild(ParticipantPanelItemElementsDirective);

	/**
	 * @ignore
	 */
	readonly externalParticipantBadge = contentChild(ParticipantPanelParticipantBadgeDirective);
	readonly templateConfig = computed<ParticipantPanelItemTemplateConfiguration>(() => {
		return this.templateManagerService.setupParticipantPanelItemTemplates(this.externalItemElements());
	});
	readonly participantPanelItemElementsTemplate = computed(
		() => this.templateConfig().participantPanelItemElementsTemplate ?? this.participantPanelItemElementsTemplateQuery()
	);
	readonly participantBadgeTemplate = computed(() => this.externalParticipantBadge()?.template);
	readonly isLocalParticipant = computed(() => this.participantInput()?.isLocal || false);
	readonly participantDisplayName = computed(() => this.participantInput()?.name || '');
	readonly hasExternalElements = computed(() => !!this.participantPanelItemElementsTemplate());

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
