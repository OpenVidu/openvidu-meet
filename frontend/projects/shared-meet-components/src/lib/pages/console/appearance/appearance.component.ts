import { Component } from '@angular/core';
import { DynamicGridComponent, ProFeatureCardComponent } from '../../../components';

@Component({
	selector: 'ov-appearance',
	standalone: true,
	imports: [DynamicGridComponent, ProFeatureCardComponent],
	templateUrl: './appearance.component.html',
	styleUrl: './appearance.component.scss'
})
export class AppearanceComponent {
	constructor() {}
}
