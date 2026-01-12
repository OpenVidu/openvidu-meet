import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ProFeatureBadgeComponent } from '../';

/**
 * Interface for selectable card option data
 */
export interface SelectableCardOption {
	id: string;
	title: string;
	description: string;
	icon?: string;
	imageUrl?: string; // Optional image URL for visual layouts
	recommended?: boolean;
	isPro?: boolean;
	disabled?: boolean;
	badge?: string;
}

/**
 * Event emitted when an option is selected
 */
export interface SelectionCardEvent {
	optionId: string;
	option: SelectableCardOption;
	previousSelection?: string | string[];
}

@Component({
    selector: 'ov-selectable-card',
    imports: [CommonModule, MatIconModule, ProFeatureBadgeComponent],
    templateUrl: './selectable-card.component.html',
    styleUrl: './selectable-card.component.scss'
})
export class SelectableCardComponent {
	/**
	 * The option data to display in the card
	 */
	@Input({ required: true }) option!: SelectableCardOption;

	/**
	 * Currently selected value(s)
	 * Can be a string (single select) or string[] (multi select)
	 */
	@Input() selectedValue: string | string[] | undefined;

	/**
	 * Whether multiple options can be selected simultaneously
	 * @default false
	 */
	@Input() allowMultiSelect: boolean = false;

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
	 * Custom icon for the PRO badge
	 * @default 'crown'
	 */
	@Input() proBadgeIcon: string = 'crown';

	/**
	 * Custom text for the PRO badge
	 * @default 'PRO'
	 */
	@Input() proBadgeText: string = 'PRO';

	/**
	 * Whether to show the recommended badge
	 * @default true
	 */
	@Input() showRecommendedBadge: boolean = true;

	/**
	 * Whether to show image instead of icon (when imageUrl is provided)
	 * @default false
	 */
	@Input() showImage: boolean = false;

	/**
	 * Whether to show both image and icon (when both are provided)
	 * @default false
	 */
	@Input() showImageAndIcon: boolean = false;

	/**
	 * Image aspect ratio for layout control
	 * @default '16/9'
	 */
	@Input() imageAspectRatio: string = '16/9';

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
	 * Event emitted when an option is selected
	 */
	@Output() optionSelected = new EventEmitter<SelectionCardEvent>();

	/**
	 * Event emitted when the card is hovered
	 */
	@Output() cardHover = new EventEmitter<{ option: SelectableCardOption; isHovering: boolean }>();

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

		const wasSelected = this.isOptionSelected(optionId);
		if (!this.allowMultiSelect && wasSelected) {
			return; // No change if already selected
		}

		// Emit selection event
		const selectionEvent: SelectionCardEvent = {
			optionId,
			option: this.option,
			previousSelection: this.selectedValue
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

	/**
	 * Check if should show image
	 */
	shouldShowImage(): boolean {
		return this.showImage && !!this.option.imageUrl;
	}

	/**
	 * Check if should show icon
	 */
	shouldShowIcon(): boolean {
		if (this.showImageAndIcon) {
			return !!this.option.icon;
		}
		return !this.shouldShowImage() && !!this.option.icon;
	}
}
