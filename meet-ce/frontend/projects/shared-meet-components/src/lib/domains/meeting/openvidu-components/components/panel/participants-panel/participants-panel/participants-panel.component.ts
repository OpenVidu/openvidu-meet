import { CommonModule } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    contentChild,
    inject,
    TemplateRef,
    viewChild
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParticipantPanelItemDirective } from '../../../../directives/template/openvidu-components-angular.directive';
import { PanelType } from '../../../../models/panel.model';
import { TranslatePipe } from '../../../../pipes/translate.pipe';
import { PanelService } from '../../../../services/panel/panel.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { ParticipantsPanelTemplateConfiguration, TemplateManagerService } from '../../../../services/template/template-manager.service';
import { ParticipantPanelItemComponent } from '../participant-panel-item/participant-panel-item.component';

/**
 * The **ParticipantsPanelComponent** is hosted inside of the {@link PanelComponent}.
 * It is in charge of displaying the participants connected to the session.
 * This component is composed by the {@link ParticipantPanelItemComponent}.
 */
@Component({
	selector: 'ov-participants-panel',
	imports: [CommonModule, MatButtonModule, MatDividerModule, MatIconModule, MatTooltipModule, TranslatePipe, ParticipantPanelItemComponent],
	templateUrl: './participants-panel.component.html',
	styleUrls: ['../../panel.component.scss', './participants-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class ParticipantsPanelComponent {
	/**
	 * @ignore
	 */
	readonly defaultParticipantPanelItemTemplateQuery = viewChild('defaultParticipantPanelItem', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly participantPanelItemTemplateQuery = contentChild('participantPanelItem', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly participantPanelAfterLocalParticipantTemplateQuery = contentChild('participantPanelAfterLocalParticipant', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly externalParticipantPanelItem = contentChild(ParticipantPanelItemDirective);

	/**
	 * @ignore
	 */
	private readonly participantService = inject(ParticipantService);
	private readonly panelService = inject(PanelService);
	private readonly templateManagerService = inject(TemplateManagerService);

	/**
	 * @ignore
	 */
	readonly localParticipant = this.participantService.localParticipantSignal;
	/**
	 * @ignore
	 */
	readonly remoteParticipants = this.participantService.remoteParticipantsSignal;
	readonly templateConfig = computed<ParticipantsPanelTemplateConfiguration>(() => {
		const participantPanelItemTemplate =
			this.participantPanelItemTemplateQuery() ?? this.defaultParticipantPanelItemTemplateQuery();

		return this.templateManagerService.setupParticipantsPanelTemplates(
			this.externalParticipantPanelItem(),
			participantPanelItemTemplate,
			this.participantPanelAfterLocalParticipantTemplateQuery()
		);
	});
	readonly participantPanelItemTemplate = computed(
		() =>
			this.templateConfig().participantPanelItemTemplate ??
			this.participantPanelItemTemplateQuery() ??
			this.defaultParticipantPanelItemTemplateQuery()
	);
	readonly participantPanelAfterLocalParticipantTemplate = computed(
		() =>
			this.templateConfig().participantPanelAfterLocalParticipantTemplate ??
			this.participantPanelAfterLocalParticipantTemplateQuery()
	);

	close() {
		this.panelService.togglePanel(PanelType.PARTICIPANTS);
	}

}

