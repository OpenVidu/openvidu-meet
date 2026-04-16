import { Component } from '@angular/core';
import { ChangeDetectionStrategy } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
	selector: 'ov-spinner',
	imports: [MatProgressSpinnerModule],
	template: `<mat-spinner />`,
	styleUrl: './spinner.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SpinnerComponent {}
