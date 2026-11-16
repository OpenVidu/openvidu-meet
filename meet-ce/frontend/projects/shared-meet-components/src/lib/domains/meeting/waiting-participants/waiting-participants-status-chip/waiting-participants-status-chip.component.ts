import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { nameHiddenParticipants } from '../../openvidu-components/models/layout/smart-layout.model';
import { PanelType } from '../../openvidu-components/models/panel.model';
import { MeetingUiConfigService } from '../../openvidu-components/services/config/meeting-ui-config.service';
import { PanelService } from '../../openvidu-components/services/panel/panel.service';
import { WaitingParticipantsAdminService } from '../waiting-participants-admin.service';

/**
 * The status rail's chip of those waiting to be let in, at its right end, shaped like the chip of the
 * people off the grid. It opens the participants panel, where they are admitted.
 */
@Component({
	selector: 'ov-waiting-participants-status-chip',
	imports: [MatIconModule, TranslatePipe],
	templateUrl: './waiting-participants-status-chip.component.html',
	styleUrl: './waiting-participants-status-chip.component.scss'
})
export class WaitingParticipantsStatusChipComponent {
	private readonly waitingAdmin = inject(WaitingParticipantsAdminService);
	private readonly panelService = inject(PanelService);

	protected readonly count = computed(() => this.waitingAdmin.waiting().length);
	protected readonly waitingNames = computed(() =>
		nameHiddenParticipants(
			this.waitingAdmin.waiting().map(({ name }) => name),
			this.count()
		)
	);
	protected readonly canOpenPanel = inject(MeetingUiConfigService).participantsPanelButtonSignal;

	protected openPanel(): void {
		if (!this.canOpenPanel() || this.panelService.isParticipantsPanelOpened()) return;

		this.panelService.togglePanel(PanelType.PARTICIPANTS);
	}
}
