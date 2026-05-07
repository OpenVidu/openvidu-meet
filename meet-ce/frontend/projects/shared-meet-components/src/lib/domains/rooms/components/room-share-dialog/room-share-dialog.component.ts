import { Clipboard } from '@angular/cdk/clipboard';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
	MAT_DIALOG_DATA,
	MatDialogActions,
	MatDialogClose,
	MatDialogContent,
	MatDialogTitle
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetRoomAccess } from '@openvidu-meet/typings';

export type RoomAccessType = 'anonymous-moderator' | 'anonymous-speaker' | 'registered';

@Component({
	selector: 'ov-share-room-dialog',
	imports: [
		FormsModule,
		MatRadioModule,
		MatFormFieldModule,
		MatInputModule,
		MatButtonModule,
		MatIconModule,
		MatDialogTitle,
		MatDialogContent,
		MatDialogActions,
		MatDialogClose,
		MatTooltipModule
	],
	templateUrl: './room-share-dialog.component.html',
	styleUrl: './room-share-dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomShareDialogComponent {
	readonly data = inject<{ access: MeetRoomAccess }>(MAT_DIALOG_DATA);

	private readonly clipboard = inject(Clipboard);
	copied = signal(false);

	selectedAccessType = signal<RoomAccessType>('registered');
	currentUrl = computed(() => {
		const access = this.data.access;
		switch (this.selectedAccessType()) {
			case 'anonymous-moderator':
				return access.anonymous.moderator.url;
			case 'anonymous-speaker':
				return access.anonymous.speaker.url;
			case 'registered':
				return access.registered.url;
		}
	});

	copyToClipboard() {
		this.clipboard.copy(this.currentUrl());
		this.copied.set(true);

		setTimeout(() => {
			this.copied.set(false);
		}, 2000);
	}
}
