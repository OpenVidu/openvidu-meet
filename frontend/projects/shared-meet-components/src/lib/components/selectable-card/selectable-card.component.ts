import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Interface for selectable card option data
 */
export interface SelectableOption {
	id: string;
	title: string;
	description: string;
	icon: string;
	recommended?: boolean;
	isPro?: boolean;
	disabled?: boolean;
	badge?: string;
	value?: any; // Additional data associated with the option
}

/**
 * Event emitted when an option is selected
 */
export interface SelectionEvent {
	optionId: string;
	option: SelectableOption;
	previousSelection?: string;
}

/**
 * Reusable selectable card component for wizard steps and forms
 *
 * @example
 * ```html
 * <ov-selectable-card
 *   [option]="recordingOption"
 *   [selectedValue]="currentSelection"
 *   [allowMultiSelect]="false"
 *   (optionSelected)="onOptionChange($event)"
 * ></ov-selectable-card>
 * ```
 */
@Component({
	selector: 'ov-selectable-card',
	standalone: true,
	imports: [CommonModule, MatIconModule],
	templateUrl: './selectable-card.component.html',
	styleUrl: './selectable-card.component.scss'
})
export class SelectableCardComponent {
	/**
	 * The option data to display in the card
	 */
	@Input({ required: true }) option!: SelectableOption;

	/**
	 * Currently selected value(s)
	 * Can be a string (single select) or string[] (multi select)
	 */
	@Input() selectedValue: string | string[] | null = null;

	/**
	 * Whether multiple options can be selected simultaneously
	 * @default false
	 */
	@Input() allowMultiSelect: boolean = false;

	/**
	 * Whether the card should show hover effects
	 * @default true
	 */
	@Input() enableHover: boolean = true;

	/**
	 * Whether the card should show selection animations
	 * @default true
	 */
	@Input() enableAnimations: boolean = true;

	/**
	 * Custom CSS classes to apply to the card
	 */
	@Input() customClasses: string = '';

	/**
	 * Whether to show the selection indicator (radio button)
	 * @default true
	 */
	@Input() showSelectionIndicator: boolean = true;

	/**
	 * Whether to show the PRO badge for premium features
	 * @default true
	 */
	@Input() showProBadge: boolean = true;

	/**
	 * Whether to show the recommended badge
	 * @default true
	 */
	@Input() showRecommendedBadge: boolean = true;

	/**
	 * Custom icon for the PRO badge
	 * @default 'star'
	 */
	@Input() proBadgeIcon: string = 'star';

	/**
	 * Custom text for the PRO badge
	 * @default 'PRO'
	 */
	@Input() proBadgeText: string = 'PRO';

	/**
	 * Event emitted when an option is selected
	 */
	@Output() optionSelected = new EventEmitter<SelectionEvent>();

	/**
	 * Event emitted when the card is clicked (even if selection doesn't change)
	 */
	@Output() cardClicked = new EventEmitter<SelectableOption>();

	/**
	 * Event emitted when the card is hovered
	 */
	@Output() cardHover = new EventEmitter<{ option: SelectableOption; isHovering: boolean }>();

	/**
	 * Check if the current option is selected
	 */
	isOptionSelected(optionId: string): boolean {
		if (!this.selectedValue) {
			return false;
		}

		if (Array.isArray(this.selectedValue)) {
			return this.selectedValue.includes(optionId);
		}

		return this.selectedValue === optionId;
	}

	/**
	 * Handle option selection click
	 */
	onOptionSelect(optionId: string): void {
		// Don't allow selection if option is disabled
		if (this.option.disabled) {
			return;
		}

		// Emit card clicked event
		this.cardClicked.emit(this.option);

		// Handle selection logic
		const wasSelected = this.isOptionSelected(optionId);
		let newSelection: string | string[] | null;
		let previousSelection: string | undefined;

		if (this.allowMultiSelect) {
			// Multi-select logic
			const currentArray = Array.isArray(this.selectedValue) ? [...this.selectedValue] : [];

			if (wasSelected) {
				// Remove from selection
				newSelection = currentArray.filter((id) => id !== optionId);
				if (newSelection.length === 0) {
					newSelection = null;
				}
			} else {
				// Add to selection
				newSelection = [...currentArray, optionId];
			}
		} else {
			// Single-select logic
			if (wasSelected) {
				// Deselect (optional behavior)
				newSelection = null;
				previousSelection = optionId;
			} else {
				// Select new option
				previousSelection = Array.isArray(this.selectedValue) ? undefined : this.selectedValue || undefined;
				newSelection = optionId;
			}
		}

		// Emit selection event
		const selectionEvent: SelectionEvent = {
			optionId,
			option: this.option,
			previousSelection
		};

		this.optionSelected.emit(selectionEvent);
	}

	/**
	 * Handle mouse enter event
	 */
	onMouseEnter(): void {
		if (this.enableHover) {
			this.cardHover.emit({ option: this.option, isHovering: true });
		}
	}

	/**
	 * Handle mouse leave event
	 */
	onMouseLeave(): void {
		if (this.enableHover) {
			this.cardHover.emit({ option: this.option, isHovering: false });
		}
	}

	/**
	 * Get dynamic CSS classes for the card
	 */
	getCardClasses(): string {
		const classes = ['option-card'];

		if (this.isOptionSelected(this.option.id)) {
			classes.push('selected');
		}

		if (this.option.recommended && this.showRecommendedBadge) {
			classes.push('recommended');
		}

		if (this.option.isPro && this.showProBadge) {
			classes.push('pro-feature');
		}

		if (this.option.disabled) {
			classes.push('disabled');
		}

		if (!this.enableHover) {
			classes.push('no-hover');
		}

		if (!this.enableAnimations) {
			classes.push('no-animations');
		}

		if (this.customClasses) {
			classes.push(this.customClasses);
		}

		return classes.join(' ');
	}

	/**
	 * Get the selection icon based on current state
	 */
	getSelectionIcon(): string {
		if (this.allowMultiSelect) {
			return this.isOptionSelected(this.option.id) ? 'check_box' : 'check_box_outline_blank';
		} else {
			return this.isOptionSelected(this.option.id) ? 'radio_button_checked' : 'radio_button_unchecked';
		}
	}

	/**
	 * Get aria-label for accessibility
	 */
	getAriaLabel(): string {
		const baseLabel = `${this.option.title}. ${this.option.description}`;
		const statusParts = [];

		if (this.option.recommended) {
			statusParts.push('Recommended');
		}

		if (this.option.isPro) {
			statusParts.push('PRO feature');
		}

		if (this.option.disabled) {
			statusParts.push('Disabled');
		}

		if (this.isOptionSelected(this.option.id)) {
			statusParts.push('Selected');
		}

		const statusLabel = statusParts.length > 0 ? `. ${statusParts.join(', ')}` : '';

		return `${baseLabel}${statusLabel}`;
	}
}
