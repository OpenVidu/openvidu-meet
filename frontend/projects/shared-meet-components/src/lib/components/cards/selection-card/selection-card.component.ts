import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BaseCardComponent } from '../base-card/base-card.component';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

@Component({
	selector: 'ov-selection-card',
	standalone: true,
	imports: [FormsModule, BaseCardComponent, MatSelectModule, MatFormFieldModule, MatInputModule],
	templateUrl: './selection-card.component.html',
	styleUrl: './selection-card.component.scss'
})
export class SelectionCardComponent extends BaseCardComponent {
	@Input() options: { label: string; value: any }[] = [];
	@Input() selectedOption: any;

	@Input() selectionType: 'text' | 'color' = 'text';
	@Output() onOptionSelected = new EventEmitter<any>();
	@Output() onColorChanged = new EventEmitter<{ label: string; value: string }>();
	onSelectionChange(event: any) {
		this.onOptionSelected.emit(event.value);
	}

	onColorChange(label: string, event: any) {
		this.onColorChanged.emit({ label, value: event.target.value });
	}
}
