import { Component } from '@angular/core';
import { ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ProFeatureBadgeComponent } from '../../../../shared';

@Component({
    selector: 'ov-logo-selector',
    imports: [MatButtonModule, MatIconModule, ProFeatureBadgeComponent],
    templateUrl: './logo-selector.component.html',
    styleUrl: './logo-selector.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LogoSelectorComponent {}
