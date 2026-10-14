import { afterRenderEffect, Component, ElementRef, inject, input } from '@angular/core';
import { LiveReaction, REACTION_EMOJI, REACTION_LIFETIME_MS } from '../../models/reaction.model';

/**
 * A reaction while it is on screen: it pops in, holds and fades out over its lifetime. The animation
 * follows the reaction's own clock, so a view that appears halfway through a reaction, or the same
 * reaction sent again, shows it where it really is instead of starting it over.
 */
@Component({
	selector: 'ov-reaction',
	templateUrl: './reaction.component.html',
	styleUrl: './reaction.component.scss',
	host: {
		'[style.--ov-reaction-lifetime]': 'lifetime'
	}
})
export class ReactionComponent {
	readonly reaction = input.required<LiveReaction>();
	/** Draws a ring around the reaction that empties as its time runs out. */
	readonly ring = input(false);

	protected readonly lifetime = `${REACTION_LIFETIME_MS}ms`;
	protected readonly emoji = REACTION_EMOJI;

	constructor() {
		const host: HTMLElement = inject(ElementRef).nativeElement;

		afterRenderEffect(() => {
			const elapsed = Date.now() - this.reaction().shownAt;

			for (const animation of host.getAnimations({ subtree: true })) {
				animation.currentTime = elapsed;
			}
		});
	}
}
