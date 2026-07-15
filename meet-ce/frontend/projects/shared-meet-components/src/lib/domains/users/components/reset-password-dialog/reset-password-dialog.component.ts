import { Clipboard } from '@angular/cdk/clipboard';
import { Component, inject, signal } from '@angular/core';
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
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { NotificationService } from '../../../../shared/services/notification.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
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
		MatDialogActions,
		TranslatePipe
	],
	templateUrl: './reset-password-dialog.component.html',
	styleUrl: './reset-password-dialog.component.scss'
})
export class ResetPasswordDialogComponent {
	readonly dialogRef = inject(MatDialogRef<ResetPasswordDialogComponent>);
	readonly data: ResetPasswordDialogData = inject(MAT_DIALOG_DATA);

	private userService = inject(UserService);
	private clipboard = inject(Clipboard);
	private notificationService = inject(NotificationService);
	private readonly translateService = inject(TranslateService);

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
		this.notificationService.showSnackbar(this.translateService.translate('USERS.ERRORS.PASSWORD_COPIED'));
	}

	async confirm() {
		const password = this.password();
		if (!password) return;

		const delayLoader = setTimeout(() => this.isSaving.set(true), 200);

		try {
			await this.userService.resetUserPassword(this.data.user.userId, password);
			this.notificationService.showSnackbar(
				`${this.translateService.translate('USERS.ERRORS.PASSWORD_RESET_SUCCESS')} ${this.data.user.name}`
			);
			this.dialogRef.close(true);
		} catch (error) {
			console.error('Error while resetting password', error);
			this.notificationService.showSnackbar(this.translateService.translate('USERS.ERRORS.PASSWORD_RESET_FAILED'));
		} finally {
			clearTimeout(delayLoader);
			this.isSaving.set(false);
		}
	}

	cancel() {
		this.dialogRef.close(false);
	}
}
