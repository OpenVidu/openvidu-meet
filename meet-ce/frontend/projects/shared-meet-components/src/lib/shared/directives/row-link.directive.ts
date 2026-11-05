import { Location } from '@angular/common';
import { Directive, inject, input } from '@angular/core';
import { Router } from '@angular/router';

const INTERACTIVE_TARGETS = 'a, button, input, mat-checkbox, .mat-column-select, .mat-column-actions';

/**
 * Makes a table row open `commands` when it is clicked, unless the click is the end of a text selection or
 * lands on a link, a button or a form control. A click with Ctrl or Cmd opens the page in a new tab.
 *
 * Usage:
 * ```html
 * <tr mat-row [ovRowLink]="['/rooms', row.roomId]"></tr>
 * ```
 */
@Directive({
	selector: '[ovRowLink]',
	host: {
		'[style.cursor]': "'pointer'",
		'(click)': 'onClick($event)'
	}
})
export class RowLinkDirective {
	private readonly router = inject(Router);
	private readonly location = inject(Location);

	readonly commands = input.required<string | unknown[]>({ alias: 'ovRowLink' });

	protected onClick(event: MouseEvent) {
		const target = event.target as Element;

		if (target.closest(INTERACTIVE_TARGETS) || window.getSelection()?.toString()) return;

		const commands = [this.commands()].flat();

		if (event.ctrlKey || event.metaKey) {
			const url = this.router.serializeUrl(this.router.createUrlTree(commands));
			window.open(this.location.prepareExternalUrl(url), '_blank');
			return;
		}

		void this.router.navigate(commands);
	}
}
