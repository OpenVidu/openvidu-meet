import { Component } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
	selector: 'ov-spinner',
	standalone: true,
	imports: [MatProgressSpinnerModule],
	template: `<mat-spinner></mat-spinner>`,
	styleUrl: './spinner.component.scss'
})
export class SpinnerComponent {}
