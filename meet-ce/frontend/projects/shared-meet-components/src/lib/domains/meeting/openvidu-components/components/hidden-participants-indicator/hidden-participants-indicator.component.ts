import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { nameHiddenParticipants } from '../../models/layout/smart-layout.model';
import { TranslatePipe } from '../../pipes/translate.pipe';

/**
 * Component that displays an indicator for participants not visible in the current layout, either as
 * an extra tile in the smart layout grid or as a chip in the meeting's status rail.
 */
@Component({
	selector: 'ov-hidden-participants-indicator',
	imports: [MatIconModule, TranslatePipe],
	templateUrl: './hidden-participants-indicator.component.html',
	styleUrl: './hidden-participants-indicator.component.scss'
})
export class HiddenParticipantsIndicatorComponent {
	count = input<number>(0);
	hiddenParticipantNames = input<string[]>([]);
	clicked = output<void>();
	mode = input<'topbar' | 'standard'>('standard');

	protected isTopBarMode = computed(() => this.mode() === 'topbar');

	protected descriptionKey = computed(() =>
		this.count() === 1 ? 'HIDDEN_PARTICIPANTS.ONE_MORE' : 'HIDDEN_PARTICIPANTS.MANY_MORE'
	);

	protected hiddenNames = computed(() => nameHiddenParticipants(this.hiddenParticipantNames(), this.count()));
}
