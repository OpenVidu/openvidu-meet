import { Component, computed, input } from '@angular/core';

/**
 * Placeholder rows a list shows while its first rows load, with the height of the rows it replaces so the page
 * does not jump when they arrive.
 */
@Component({
	selector: 'ov-table-skeleton',
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
	styleUrl: './table-skeleton.component.scss'
})
export class TableSkeletonComponent {
	/** Text announced to assistive technology while the rows load. */
	readonly label = input.required<string>();
	readonly count = input(5);

	protected readonly rows = computed(() => Array.from({ length: this.count() }, (_, index) => index));
}
