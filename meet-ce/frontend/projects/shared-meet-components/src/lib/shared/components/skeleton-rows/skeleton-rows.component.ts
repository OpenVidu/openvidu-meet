import { booleanAttribute, Component, computed, input } from '@angular/core';

/**
 * Placeholder rows shown while content loads, with the height of the rows they replace so the page does not jump
 * when it arrives. `plain` drops the card around them, for use inside a card; `delayed` keeps them invisible for the
 * first 300 ms, so a fast response never flashes them.
 */
@Component({
	selector: 'ov-skeleton-rows',
	template: `
		<div role="status" class="visually-hidden">{{ label() }}</div>
		@for (row of rows(); track row) {
			<div class="row" aria-hidden="true">
				<span class="bar avatar"></span>
				<span class="bar wide"></span>
				<span class="bar"></span>
				<span class="bar"></span>
			</div>
		}
	`,
	host: {
		'[class.plain]': 'plain()',
		'[class.delayed]': 'delayed()'
	},
	styleUrl: './skeleton-rows.component.scss'
})
export class SkeletonRowsComponent {
	/** Text announced to assistive technology while the rows load. */
	readonly label = input.required<string>();
	readonly count = input(5);
	readonly plain = input(false, { transform: booleanAttribute });
	readonly delayed = input(false, { transform: booleanAttribute });

	protected readonly rows = computed(() => Array.from({ length: this.count() }, (_, index) => index));
}
