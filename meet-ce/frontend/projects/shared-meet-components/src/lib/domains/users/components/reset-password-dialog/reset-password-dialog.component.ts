import { Clipboard } from '@angular/cdk/clipboard';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
	MAT_DIALOG_DATA,
	MatDialogActions,
	MatDialogContent,
	MatDialogRef,
	MatDialogTitle
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetUserDTO } from '@openvidu-meet/typings';
import { NotificationService } from '../../../../shared/services/notification.service';
import { UserService } from '../../services/user.service';
import { UsersUiUtils } from '../../utils/ui';

export interface ResetPasswordDialogData {
	user: MeetUserDTO;
}

@Component({
	selector: 'ov-reset-password-dialog',
	imports: [
		FormsModule,
		MatButtonModule,
		MatIconModule,
		MatFormFieldModule,
		MatInputModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatDialogTitle,
		MatDialogContent,
		MatDialogActions
	],
	templateUrl: './reset-password-dialog.component.html',
	styleUrl: './reset-password-dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResetPasswordDialogComponent {
	readonly dialogRef = inject(MatDialogRef<ResetPasswordDialogComponent>);
	readonly data: ResetPasswordDialogData = inject(MAT_DIALOG_DATA);

	private clipboard = inject(Clipboard);
	private userService = inject(UserService);
	private notificationService = inject(NotificationService);

	password = signal('');
	showPassword = signal(false);
	isSaving = signal(false);
	copied = signal(false);

	generatePassword() {
		this.password.set(UsersUiUtils.generateTemporaryPassword());
		this.showPassword.set(true);
	}

	copyToClipboard() {
		const password = this.password();
		if (!password) return;
		this.clipboard.copy(password);
		this.copied.set(true);
		setTimeout(() => this.copied.set(false), 2000);
		this.notificationService.showSnackbar('Password copied to clipboard');
	}

	async confirm() {
		const password = this.password();
		if (!password) return;
		this.isSaving.set(true);
		try {
			await this.userService.resetUserPassword(this.data.user.userId, password);
			this.notificationService.showSnackbar(`Password reset successfully for ${this.data.user.name}`);
			this.dialogRef.close(true);
		} catch (error) {
			this.notificationService.showSnackbar('Failed to reset password');
		} finally {
			this.isSaving.set(false);
		}
	}

	cancel() {
		this.dialogRef.close(false);
	}
}
