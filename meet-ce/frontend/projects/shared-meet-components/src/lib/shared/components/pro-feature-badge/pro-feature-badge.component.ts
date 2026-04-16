import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'ov-pro-feature-badge',
    imports: [MatIconModule],
    templateUrl: './pro-feature-badge.component.html',
    styleUrl: './pro-feature-badge.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProFeatureBadgeComponent {
    badgeIcon = input<string>('crown'); // Default icon
    badgeText = input<string>('Pro Feature'); // Default text
}
