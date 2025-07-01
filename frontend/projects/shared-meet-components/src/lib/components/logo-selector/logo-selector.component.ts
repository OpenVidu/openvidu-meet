import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ProFeatureBadgeComponent } from '../pro-feature-badge/pro-feature-badge.component';

@Component({
	selector: 'ov-logo-selector',
	standalone: true,
	imports: [MatButtonModule, MatIconModule, ProFeatureBadgeComponent],
	templateUrl: './logo-selector.component.html',
	styleUrl: './logo-selector.component.scss'
})
export class LogoSelectorComponent {}
