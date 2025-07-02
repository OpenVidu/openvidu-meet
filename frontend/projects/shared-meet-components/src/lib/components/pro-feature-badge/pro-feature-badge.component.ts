import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
	selector: 'ov-pro-feature-badge',
	standalone: true,
	imports: [MatIconModule],
	templateUrl: './pro-feature-badge.component.html',
	styleUrl: './pro-feature-badge.component.scss'
})
export class ProFeatureBadgeComponent {
	@Input() badgeIcon: string = 'crown'; // Default icon
	@Input() badgeText: string = 'Pro Feature'; // Default text
}
