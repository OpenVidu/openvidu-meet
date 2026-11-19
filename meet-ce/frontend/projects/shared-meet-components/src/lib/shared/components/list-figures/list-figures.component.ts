import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ViewportService } from '../../../domains/meeting/openvidu-components/services/viewport/viewport.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ListFigure } from './list-figure.model';

/**
 * The key figures of a list page, above the list: tiles from 768 px (compact below 1200 px) and, on a phone, one
 * card with the total, a bar split by figure and a chip per figure. A figure with a filter is a button that
 * selects it, or clears it when it is already selected; one without a filter only informs.
 */
@Component({
	selector: 'ov-list-figures',
	imports: [MatIconModule, NgTemplateOutlet, RouterLink, TranslatePipe],
	templateUrl: './list-figures.component.html',
	styleUrl: './list-figures.component.scss'
})
export class ListFiguresComponent<TFilter = unknown> {
	readonly figures = input.required<ListFigure<TFilter>[]>();
	/** Key of the figure the list's current filter matches. */
	readonly selectedKey = input<string>();
	/** What the figures count, in the plural ("rooms"). */
	readonly unit = input.required<string>();
	/** The filter of the figure the user selected, or `null` to clear it. */
	readonly figureSelect = output<TFilter | null>();

	protected readonly isMobileView = inject(ViewportService).isMobileView;

	protected readonly total = computed(() => this.figures().find(({ filter }) => filter === null)?.count ?? 0);
	protected readonly selectableFigures = computed(() => this.figures().filter(({ filter }) => filter !== undefined));
	protected readonly barSegments = computed(() =>
		this.figures().filter(({ filter, count }) => filter != null && count > 0)
	);
	protected readonly informingFigure = computed(() => this.figures().find(({ filter }) => filter === undefined));

	protected share(figure: ListFigure<TFilter>): number {
		return this.total() ? Math.round((figure.count * 100) / this.total()) : 0;
	}

	protected select(figure: ListFigure<TFilter>) {
		if (figure.filter === undefined) return;

		this.figureSelect.emit(figure.key === this.selectedKey() ? null : figure.filter);
	}
}
