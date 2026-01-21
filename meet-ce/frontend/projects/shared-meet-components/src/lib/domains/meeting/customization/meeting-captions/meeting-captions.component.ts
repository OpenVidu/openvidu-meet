import { CommonModule } from '@angular/common';
import { Component, effect, ElementRef, input, QueryList, signal, untracked, ViewChildren } from '@angular/core';
import { Caption } from '../../models/captions.model';

@Component({
	selector: 'ov-meeting-captions',
	imports: [CommonModule],
	templateUrl: './meeting-captions.component.html',
	styleUrl: './meeting-captions.component.scss'
})
export class MeetingCaptionsComponent {
	// Reactive caption data from service
	captions = input<Caption[]>([]);

	// Track animation state for each caption
	protected readonly captionAnimationState = signal<Map<string, 'entering' | 'active' | 'leaving'>>(new Map());

	// ViewChildren to access caption text containers for auto-scroll
	@ViewChildren('captionTextContainer')
	captionTextContainers!: QueryList<ElementRef<HTMLDivElement>>;

	constructor() {
		// Monitor caption changes and update animation states
		effect(() => {
			const currentCaptions = this.captions();

			// Use untracked to read current state without subscribing to it
			const animationStates = new Map(untracked(() => this.captionAnimationState()));

			// Mark new captions as entering
			currentCaptions.forEach((caption) => {
				if (!animationStates.has(caption.id)) {
					animationStates.set(caption.id, 'entering');
					// Transition to active after a brief delay
					setTimeout(() => {
						// Use untracked to avoid triggering the effect again
						const states = new Map(untracked(() => this.captionAnimationState()));
						states.set(caption.id, 'active');
						this.captionAnimationState.set(states);
					}, 50);
				}
			});

			// Remove states for captions that no longer exist
			const currentIds = new Set(currentCaptions.map((c) => c.id));
			animationStates.forEach((_, id) => {
				if (!currentIds.has(id)) {
					animationStates.delete(id);
				}
			});

			this.captionAnimationState.set(animationStates);

			// Auto-scroll to bottom of each caption after captions update
			this.scrollCaptionsToBottom();
		});
	}

	/**
	 * Gets the CSS classes for a caption based on its state.
	 *
	 * @param caption The caption item
	 * @returns CSS class string
	 */
	protected getCaptionClasses(caption: Caption): string {
		const classes: string[] = ['caption-item'];

		// Add final/interim class
		classes.push(caption.isFinal ? 'caption-final' : 'caption-interim');

		// Add animation state class
		const animationState = this.captionAnimationState().get(caption.id);
		if (animationState) {
			classes.push(`caption-${animationState}`);
		}

		return classes.join(' ');
	}

	/**
	 * Tracks captions by their ID for optimal Angular rendering.
	 *
	 * @param index Item index
	 * @param caption Caption item
	 * @returns Unique identifier
	 */
	protected trackByCaption(index: number, caption: Caption): string {
		return caption.id;
	}

	/**
	 * Scrolls all caption text containers to the bottom to show the most recent text.
	 * Called automatically when captions are updated.
	 */
	private scrollCaptionsToBottom(): void {
		// Use setTimeout to ensure DOM has updated
		setTimeout(() => {
			if (this.captionTextContainers) {
				this.captionTextContainers.forEach((container: ElementRef<HTMLDivElement>) => {
					const element = container.nativeElement;
					element.scrollTop = element.scrollHeight;
				});
			}
		}, 20);
	}
}
