import { Location } from '@angular/common';
import { Directive, inject, input } from '@angular/core';
import { Router } from '@angular/router';

const INTERACTIVE_TARGETS = 'a, button, input, mat-checkbox, .mat-column-select, .mat-column-actions';
const MIDDLE_BUTTON = 1;

/**
 * Makes a table row open `commands` when it is clicked, unless the click is the end of a text selection or
 * lands on a link, a button or a form control. A click with Ctrl or Cmd, or with the middle button, opens the
 * page in a new tab.
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
		'(click)': 'onClick($event)',
		'(mousedown)': 'onMouseDown($event)',
		'(auxclick)': 'onAuxClick($event)'
	}
})
export class RowLinkDirective {
	private readonly router = inject(Router);
	private readonly location = inject(Location);

	readonly commands = input.required<string | unknown[]>({ alias: 'ovRowLink' });

	protected onClick(event: MouseEvent) {
		if (this.landsOnControl(event) || window.getSelection()?.toString()) return;

		if (event.ctrlKey || event.metaKey) {
			this.openInNewTab();
			return;
		}

		void this.router.navigate([this.commands()].flat());
	}

	protected onMouseDown(event: MouseEvent) {
		if (event.button === MIDDLE_BUTTON && !this.landsOnControl(event)) event.preventDefault();
	}

	protected onAuxClick(event: MouseEvent) {
		if (event.button !== MIDDLE_BUTTON || this.landsOnControl(event)) return;

		this.openInNewTab();
	}

	private landsOnControl(event: MouseEvent): boolean {
		return !!(event.target as Element).closest(INTERACTIVE_TARGETS);
	}

	private openInNewTab() {
		const url = this.router.serializeUrl(this.router.createUrlTree([this.commands()].flat()));
		window.open(this.location.prepareExternalUrl(url), '_blank');
	}
}
