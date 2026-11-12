import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SharedMaterialSymbol } from '../../icons/shared-material-symbols';

@Component({
    selector: 'ov-pro-feature-badge',
    imports: [MatIconModule],
    templateUrl: './pro-feature-badge.component.html',
    styleUrl: './pro-feature-badge.component.scss'
})
export class ProFeatureBadgeComponent {
    badgeIcon = input<SharedMaterialSymbol>('crown'); // Default icon
    badgeText = input<string>('Pro Feature'); // Default text
}
