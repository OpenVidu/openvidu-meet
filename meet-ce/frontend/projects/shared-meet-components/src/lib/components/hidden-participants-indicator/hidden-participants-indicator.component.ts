import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Component that displays an indicator for participants not visible in the current layout.
 * This appears as an extra participant tile when using the "Last N" smart layout feature.
 * Adapts its layout based on parent element class:
 * - Horizontal (bar) layout when placed in a top bar.
 * - Standard (vertical) layout otherwise.
 */
@Component({
	selector: 'ov-hidden-participants-indicator',
	imports: [CommonModule, MatIconModule],
	templateUrl: './hidden-participants-indicator.component.html',
	styleUrl: './hidden-participants-indicator.component.scss'
})
export class HiddenParticipantsIndicatorComponent {
	/**
	 * Number of hidden participants not currently visible in the layout
	 */
	count = input<number>(0);

	/**
	 * Names of hidden participants (used in topbar mode to show who is hidden)
	 */
	hiddenParticipantNames = input<string[]>([]);

	mode = input<'topbar' | 'standard'>('standard');

	protected isTopBarMode = computed(() => this.mode() === 'topbar');

	constructor() {}

	/**
	 * Get the display text for the hidden participants count
	 */
	protected displayText = computed(() => {
		return `+${this.count()}`;
	});

	protected descriptionText = computed(() => {
		return `hidden participant${this.count() === 1 ? '' : 's'}`;
	});

	/**
	 * Get formatted participant names for display in topbar mode
	 * Shows up to 3 names, then "and X more" if there are additional participants
	 */
	protected formattedParticipantNames = computed(() => {
		const names = this.hiddenParticipantNames();
		const total = this.count();

		if (!names || names.length === 0) {
			return '';
		}

		const maxNamesToShow = 3;
		const visibleNames = names.slice(0, maxNamesToShow);
		const remaining = total - visibleNames.length;

		if (remaining > 0) {
			return `${visibleNames.join(', ')} and ${remaining} more`;
		}

		return visibleNames.join(', ');
	});
}
