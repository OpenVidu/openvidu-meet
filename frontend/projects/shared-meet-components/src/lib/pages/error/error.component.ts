import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { ErrorReason } from '@lib/models';
import { AppDataService, AuthService, NavigationService, WebComponentManagerService } from '@lib/services';

@Component({
	selector: 'ov-error',
	standalone: true,
	imports: [MatCardModule, MatIconModule, MatButtonModule],
	templateUrl: './error.component.html',
	styleUrl: './error.component.scss'
})
export class ErrorComponent implements OnInit {
	errorName = 'Error';
	message = '';

	showBackButton = true;
	backButtonText = 'Back';

	constructor(
		private route: ActivatedRoute,
		protected authService: AuthService,
		protected navService: NavigationService,
		protected appDataService: AppDataService,
		protected wcManagerService: WebComponentManagerService
	) {}

	ngOnInit() {
		this.setErrorReason();
		this.setBackButtonText();
	}

	/**
	 * Retrieves the error reason from URL query parameters
	 */
	private setErrorReason() {
		const reason = this.route.snapshot.queryParams['reason'];
		if (reason) {
			const { title, message } = this.mapReasonToNameAndMessage(reason);
			this.errorName = title;
			this.message = message;
		}
	}

	/**
	 * Maps technical error reasons to user-friendly names and messages
	 */
	private mapReasonToNameAndMessage(reason: string): { title: string; message: string } {
		const reasonMap: { [key in ErrorReason]: { title: string; message: string } } = {
			[ErrorReason.MISSING_ROOM_SECRET]: {
				title: 'Missing secret',
				message: 'You need to provide a secret to join the room as a moderator or publisher'
			},
			[ErrorReason.MISSING_RECORDING_SECRET]: {
				title: 'Missing secret',
				message: 'You need to provide a secret to access the recording'
			},
			[ErrorReason.INVALID_ROOM_SECRET]: {
				title: 'Invalid secret',
				message: 'The secret provided to join the room is neither valid for moderators nor publishers'
			},
			[ErrorReason.INVALID_RECORDING_SECRET]: {
				title: 'Invalid secret',
				message: 'The secret provided to access the recording is invalid'
			},
			[ErrorReason.INVALID_ROOM]: {
				title: 'Invalid room',
				message: 'The room you are trying to join does not exist or has been deleted'
			},
			[ErrorReason.INVALID_RECORDING]: {
				title: 'Invalid recording',
				message: 'The recording you are trying to access does not exist or has been deleted'
			},
			[ErrorReason.NO_RECORDINGS]: {
				title: 'No recordings',
				message: 'There are no recordings in this room or the room does not exist'
			},
			[ErrorReason.UNAUTHORIZED_RECORDING_ACCESS]: {
				title: 'Unauthorized recording access',
				message: 'You are not authorized to access the recordings in this room'
			},
			[ErrorReason.RECORDINGS_ADMIN_ONLY_ACCESS]: {
				title: 'Unauthorized recording access',
				message: 'Recordings access is configured for admins only in this room'
			},
			[ErrorReason.INTERNAL_ERROR]: {
				title: 'Internal error',
				message: 'An unexpected error occurred, please try again later'
			}
		};

		const normalizedReason = Object.values(ErrorReason).find((enumValue) => enumValue === reason) as
			| ErrorReason
			| undefined;
		return reasonMap[normalizedReason ?? ErrorReason.INTERNAL_ERROR];
	}

	/**
	 * Sets the back button text based on the application mode and user role
	 */
	async setBackButtonText() {
		const isStandaloneMode = this.appDataService.isStandaloneMode();
		const redirection = this.navService.getLeaveRedirectURL();
		const isAdmin = await this.authService.isAdmin();

		if (isStandaloneMode && !redirection && !isAdmin) {
			// If in standalone mode, no redirection URL and not an admin, hide the back button
			this.showBackButton = false;
			return;
		}

		this.showBackButton = true;
		this.backButtonText = isStandaloneMode && !redirection && isAdmin ? 'Back to Console' : 'Accept';
	}

	/**
	 * Handles the back button click event and navigates accordingly
	 * If in embedded mode, it closes the WebComponentManagerService
	 * If in standalone mode, it navigates to the redirect URL or to the admin console
	 */
	async goBack() {
		if (this.appDataService.isEmbeddedMode()) {
			this.wcManagerService.close();
			return;
		}

		// Standalone mode handling
		const redirectTo = this.navService.getLeaveRedirectURL();
		if (redirectTo) {
			// Navigate to the specified redirect URL
			await this.navService.redirectTo(redirectTo);
			return;
		}

		// Navigate to the admin console
		await this.navService.navigateTo('/overview', undefined, true);
	}
}
