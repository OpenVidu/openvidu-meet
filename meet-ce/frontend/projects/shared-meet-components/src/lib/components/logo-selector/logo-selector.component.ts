import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ProFeatureBadgeComponent } from '@lib/components';

@Component({
    selector: 'ov-logo-selector',
    imports: [MatButtonModule, MatIconModule, ProFeatureBadgeComponent],
    templateUrl: './logo-selector.component.html',
    styleUrl: './logo-selector.component.scss'
})
export class LogoSelectorComponent {}
