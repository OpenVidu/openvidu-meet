import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

/**
 * Component that displays an indicator for participants not visible in the current layout.
 * This appears as an extra participant tile when using the "Last N" smart layout feature.
 * Adapts its layout based on parent element class:
 * - Horizontal (bar) layout when placed in a top bar.
 * - Standard (vertical) layout otherwise.
 */
@Component({
	selector: 'ov-hidden-participants-indicator',
	imports: [CommonModule],
	templateUrl: './hidden-participants-indicator.component.html',
	styleUrl: './hidden-participants-indicator.component.scss'
})
export class HiddenParticipantsIndicatorComponent {
	/**
	 * Number of hidden participants not currently visible in the layout
	 */
	count = input<number>(0);

	mode = input<'topbar' | 'standard'>('standard');

	protected isTopBarMode = computed(() => this.mode() === 'topbar');

	constructor() {}

	/**
	 * Get the display text for the hidden participants count
	 */
	protected displayText = computed(() => {
		if (this.count() === 0) return '';
		return `+${this.count()}`;
	});

	protected descriptionText = computed(() => {
		return this.count() === 1 ? 'participant not visible' : 'participants not visible';
	});
}
