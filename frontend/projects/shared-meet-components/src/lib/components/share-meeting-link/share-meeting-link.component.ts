import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
	selector: 'ov-share-meeting-link',
	standalone: true,
	imports: [MatButtonModule, MatIconModule],
	templateUrl: './share-meeting-link.component.html',
	styleUrl: './share-meeting-link.component.scss'
})
export class ShareMeetingLinkComponent {
	@Input() meetingUrl!: string;
	@Input() title: string = 'Invite others with this meeting link';
	@Input() titleSize: 'sm' | 'md' | 'lg' | 'xl' = 'sm';
	@Input() titleWeight: 'light' | 'semibold' | 'bold' | 'normal' = 'normal';
	@Input() subtitle?: string;
	@Input() additionalInfo?: string;
	@Output() copyClicked = new EventEmitter<void>();
}
