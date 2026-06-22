import { Component, inject } from '@angular/core';
import { ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ProFeatureBadgeComponent } from '../../../../shared';
import { AssetsService } from '../../../../shared/services/assets.service';

@Component({
    selector: 'ov-logo-selector',
    imports: [MatButtonModule, MatIconModule, ProFeatureBadgeComponent],
    templateUrl: './logo-selector.component.html',
    styleUrl: './logo-selector.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LogoSelectorComponent {
    private readonly assets = inject(AssetsService);

    /** Default OpenVidu logo served as a static asset (resolves in SPA & WC modes). */
    protected readonly logoUrl = this.assets.logo;
}
