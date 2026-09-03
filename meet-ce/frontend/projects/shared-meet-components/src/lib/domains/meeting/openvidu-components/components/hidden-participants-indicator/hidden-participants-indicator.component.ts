import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
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
	private static readonly MAX_NAMES_SHOWN = 3;

	count = input<number>(0);
	hiddenParticipantNames = input<string[]>([]);
	clicked = output<void>();
	mode = input<'topbar' | 'standard'>('standard');

	protected isTopBarMode = computed(() => this.mode() === 'topbar');

	protected descriptionKey = computed(() =>
		this.count() === 1 ? 'HIDDEN_PARTICIPANTS.ONE_MORE' : 'HIDDEN_PARTICIPANTS.MANY_MORE'
	);

	/** The first few names, and how many hidden participants are left unnamed after them. */
	protected hiddenNames = computed(() => {
		const shown = this.hiddenParticipantNames()
			.filter(Boolean)
			.slice(0, HiddenParticipantsIndicatorComponent.MAX_NAMES_SHOWN);

		if (shown.length === 0) return undefined;

		return { shown: shown.join(', '), remaining: this.count() - shown.length };
	});
}
