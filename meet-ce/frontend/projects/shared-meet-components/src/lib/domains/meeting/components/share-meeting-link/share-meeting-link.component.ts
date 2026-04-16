import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'ov-share-meeting-link',
    imports: [MatButtonModule, MatIconModule],
    templateUrl: './share-meeting-link.component.html',
    styleUrl: './share-meeting-link.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShareMeetingLinkComponent {
	meetingUrl = input.required<string>();
	title = input<string>('Invite others with this meeting link');
	titleSize = input<'sm' | 'md' | 'lg' | 'xl'>('sm');
	titleWeight = input<'light' | 'semibold' | 'bold' | 'normal'>('normal');
	subtitle = input<string | undefined>(undefined);
	additionalInfo = input<string | undefined>(undefined);
	copyClicked = output<void>();
}
