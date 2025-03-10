import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { BaseCardComponent } from '../base-card/base-card.component';

@Component({
	selector: 'ov-toggle-card',
	standalone: true,
	imports: [MatSlideToggleModule, BaseCardComponent],
	templateUrl: './toggle-card.component.html',
	styleUrl: './toggle-card.component.scss'
})
export class ToggleCardComponent extends BaseCardComponent {
	/**
	 * A boolean input property that determines the toggle state. Only applicable when `footerType` is set to `'toggle'`.
	 * Defaults to `false`.
	 */
	@Input() toggleValue: boolean = false;

	@Output() onToggleValueChanged = new EventEmitter<boolean>();

	onToggleChange(event: any) {
		this.onToggleValueChanged.emit(event.checked);
	}
}
