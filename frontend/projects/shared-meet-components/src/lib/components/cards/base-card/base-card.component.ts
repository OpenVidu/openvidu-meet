import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';

@Component({
	selector: 'ov-base-card',
	standalone: true,
	imports: [MatCardModule, MatIconModule, MatDividerModule],
	templateUrl: './base-card.component.html',
	styleUrl: './base-card.component.scss'
})
export class BaseCardComponent implements AfterViewInit {
	/**
	 * Whether the card is disabled or not. Defaults to false.
	 * If true, the card will not be clickable.
	 **/
	@Input() disabled: boolean = false;
	/**
	 * The title of the dynamic card component.
	 * This input property allows setting a custom title for the card.
	 */
	@Input() title: string = '';
	/**
	 * A brief description of the dynamic card component.
	 * This input property allows setting a description for the card.
	 */
	@Input() description: string = '';
	/**
	 * The name of the icon to be displayed. Defaults to "settings".
	 *
	 * @type {string}
	 * @default 'settings'
	 */
	@Input() icon: string = 'settings';

	/**
	 * The color of the icon.
	 *
	 * @default '#ffffff'
	 */
	@Input() iconColor: string = '#ffffff';

	/**
	 *
	 * The URL of the icon to be displayed.
	 *
	 *
	 */
	@Input() iconUrl: string = '';
	/**
	 * The background color of the icon.
	 *
	 * @default '#000000'
	 */
	@Input() iconBackgroundColor: string = '#000000';
	/**
	 * The background color of the card component.
	 * Accepts any valid CSS color string.
	 */
	@Input() cardBackgroundColor: string = '#ffffff';

	// Content child reference to the card content.
	@ViewChild('cardContent', { static: false }) cardContent: ElementRef | undefined;
	showCardContent: boolean = false;

	constructor(protected cdr: ChangeDetectorRef) {}

	ngAfterViewInit() {
		this.showCardContent = this.cardContent?.nativeElement.children.length > 0;
		this.cdr.detectChanges();
	}
}
