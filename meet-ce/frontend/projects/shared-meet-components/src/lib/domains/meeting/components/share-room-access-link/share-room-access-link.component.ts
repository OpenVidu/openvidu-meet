import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
    selector: 'ov-share-room-access-link',
    imports: [MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe],
    templateUrl: './share-room-access-link.component.html',
    styleUrl: './share-room-access-link.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShareRoomAccessLinkComponent {
	roomAccessUrl = input.required<string>();
	// Undefined by default so the template can resolve the localized fallback reactively via the
	// translate pipe (an imperative translate() here would capture the language loaded at construction
	// and never react to lazy locale loads or language switches).
	title = input<string>();
	titleSize = input<'sm' | 'md' | 'lg' | 'xl'>('sm');
	titleWeight = input<'light' | 'semibold' | 'bold' | 'normal'>('normal');
	subtitle = input<string | undefined>(undefined);
	additionalInfo = input<string | undefined>(undefined);
	copyClicked = output<void>();
}
