import { Component } from '@angular/core';
import { Input } from '@angular/core';
import { Output, EventEmitter } from '@angular/core';
import { MatButtonModule, MatIconButton } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
	selector: 'ov-share-meeting-link',
	standalone: true,
	imports: [MatButtonModule, MatIconModule, MatIconButton],
	templateUrl: './share-meeting-link.component.html',
	styleUrl: './share-meeting-link.component.scss'
})
export class ShareMeetingLinkComponent {
	@Input() meetingUrl!: string;
	@Output() copyClicked = new EventEmitter<void>();
}
