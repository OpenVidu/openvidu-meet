import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'ov-share-room-access-link',
    imports: [MatButtonModule, MatIconModule],
    templateUrl: './share-room-access-link.component.html',
    styleUrl: './share-room-access-link.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShareRoomAccessLinkComponent {
	roomAccessUrl = input.required<string>();
	title = input<string>('Invite others with this room access link');
	titleSize = input<'sm' | 'md' | 'lg' | 'xl'>('sm');
	titleWeight = input<'light' | 'semibold' | 'bold' | 'normal'>('normal');
	subtitle = input<string | undefined>(undefined);
	additionalInfo = input<string | undefined>(undefined);
	copyClicked = output<void>();
}
