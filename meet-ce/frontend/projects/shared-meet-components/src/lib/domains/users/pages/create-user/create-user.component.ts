import { Clipboard } from '@angular/cdk/clipboard';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetUserRole } from '@openvidu-meet/typings';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { UserService } from '../../services/user.service';
import { UsersUiUtils } from '../../utils/ui';

@Component({
	selector: 'ov-create-user',
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatCardModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatSelectModule,
		MatTooltipModule,
		MatProgressSpinnerModule
	],
	templateUrl: './create-user.component.html',
	styleUrl: './create-user.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateUserComponent {
	private userService = inject(UserService);
	private navigationService = inject(NavigationService);
	private notificationService = inject(NotificationService);
	private clipboard = inject(Clipboard);

	isSaving = signal(false);
	showPassword = signal(false);
	copied = signal(false);

	availableRoles: MeetUserRole[] = [...UsersUiUtils.AVAILABLE_ROLES];
	protected readonly UsersUiUtils = UsersUiUtils;

	form = new FormGroup({
		userId: new FormControl('', [
			Validators.required,
			Validators.minLength(5),
			Validators.maxLength(20),
			Validators.pattern(/^[a-z0-9_]+$/)
		]),
		name: new FormControl('', [Validators.required, Validators.maxLength(50)]),
		role: new FormControl<MeetUserRole>(MeetUserRole.USER, [Validators.required]),
		password: new FormControl('', [Validators.required, Validators.minLength(5)])
	});

	generatePassword() {
		this.form.get('password')?.setValue(UsersUiUtils.generateTemporaryPassword());
		this.showPassword.set(true);
	}

	copyPasswordToClipboard() {
		const password = this.form.get('password')?.value ?? '';
		if (!password) {
			return;
		}

		this.clipboard.copy(password);
		this.copied.set(true);
		setTimeout(() => this.copied.set(false), 2000);
		this.notificationService.showSnackbar('Password copied to clipboard');
	}

	async onSubmit() {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		const { userId, name, role, password } = this.form.getRawValue();
		const delayLoader = setTimeout(() => this.isSaving.set(true), 200);

		try {
			await this.userService.createUser({ userId: userId!, name: name!, role: role!, password: password! });
			this.notificationService.showSnackbar('User created successfully');
			await this.navigationService.navigateTo('/users');
		} catch (error: any) {
			console.error('Error creating user:', error);
			this.notificationService.showSnackbar('Failed to create user');
		} finally {
			clearTimeout(delayLoader);
			this.isSaving.set(false);
		}
	}

	async onCancel() {
		await this.navigationService.navigateTo('/users');
	}

	getFieldError(field: string): string | null {
		const control = this.form.get(field);
		if (!control?.errors || !control.touched) {
			return null;
		}

		if (control.errors['required']) {
			return 'This field is required';
		}
		if (control.errors['minlength']) {
			return `Minimum ${control.errors['minlength'].requiredLength} characters required`;
		}
		if (control.errors['pattern']) {
			return 'Only lowercase letters, numbers and underscores allowed';
		}
		if (control.errors['maxlength']) {
			return `Maximum ${control.errors['maxlength'].requiredLength} characters allowed`;
		}

		return null;
	}
}
