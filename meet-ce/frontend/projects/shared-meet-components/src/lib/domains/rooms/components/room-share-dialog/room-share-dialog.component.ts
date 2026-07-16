import { Clipboard } from '@angular/cdk/clipboard';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
	MAT_DIALOG_DATA,
	MatDialogActions,
	MatDialogClose,
	MatDialogContent,
	MatDialogRef,
	MatDialogTitle
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetRoomAccess } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { WizardStepId } from '../../models/wizard.model';

export type RoomAccessType = 'anonymous-moderator' | 'anonymous-speaker' | 'user';

export interface RoomShareDialogData {
	access: MeetRoomAccess;
	roomId?: string;
	canManageRoom?: boolean;
}

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
		MatTooltipModule,
		TranslatePipe
	],
	templateUrl: './room-share-dialog.component.html',
	styleUrl: './room-share-dialog.component.scss'
})
export class RoomShareDialogComponent {
	readonly data = inject<RoomShareDialogData>(MAT_DIALOG_DATA);

	private readonly clipboard = inject(Clipboard);
	private readonly navigationService = inject(NavigationService);
	private readonly dialogRef = inject(MatDialogRef<RoomShareDialogComponent>);

	copied = signal(false);
	roomUrl = signal<string | undefined>(undefined);

	selectedAccessType = signal<RoomAccessType>('user');

	currentUrl = computed(() => {
		const access = this.data.access;
		switch (this.selectedAccessType()) {
			case 'anonymous-moderator':
				return access.anonymous.moderator.url;
			case 'anonymous-speaker':
				return access.anonymous.speaker.url;
			case 'user':
				return access.user.url;
		}
	});

	selectedAccessLabel = computed(() => {
		switch (this.selectedAccessType()) {
			case 'anonymous-moderator':
				return 'ROOMS.SHARE_DIALOG.ANONYMOUS_MODERATOR';
			case 'anonymous-speaker':
				return 'ROOMS.SHARE_DIALOG.ANONYMOUS_SPEAKER';
			case 'user':
				return this.data.access.user.enabled
					? 'ROOMS.SHARE_DIALOG.USERS'
					: 'ROOMS.SHARE_DIALOG.USER_MEMBERS';
		}
	});

	isCurrentAccessSelectable = computed(() => this.isAccessEnabled(this.selectedAccessType()));

	isAccessEnabled(accessType: RoomAccessType): boolean {
		const access = this.data.access;
		switch (accessType) {
			case 'anonymous-moderator':
				return access.anonymous.moderator.enabled;
			case 'anonymous-speaker':
				return access.anonymous.speaker.enabled;
			case 'user':
				// User access link always works for admins and user members,
				// even when general user access is disabled.
				return true;
		}
	}

	onAccessTypeChange(accessType: RoomAccessType) {
		this.selectedAccessType.set(accessType);
		this.roomUrl.set(undefined);
		this.copied.set(false);
	}

	generateLink() {
		if (!this.isCurrentAccessSelectable()) return;
		this.roomUrl.set(this.currentUrl());
	}

	copyToClipboard() {
		const url = this.roomUrl();
		if (!url) return;

		this.clipboard.copy(url);
		this.copied.set(true);

		setTimeout(() => {
			this.copied.set(false);
		}, 2000);
	}

	goBack() {
		this.roomUrl.set(undefined);
		this.copied.set(false);
	}

	async editRoomAccess() {
		if (!this.data.canManageRoom || !this.data.roomId) return;
		this.dialogRef.close();
		await this.navigationService.navigateTo(`/rooms/${this.data.roomId}/edit`, { step: WizardStepId.ROOM_ACCESS });
	}
}
