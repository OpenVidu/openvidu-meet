import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { NavigationErrorReason } from '../../../../shared/models/navigation.model';
import { AppDataService } from '../../../../shared/services/app-data.service';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { AuthService } from '../../../auth/services/auth.service';
import { MeetingWebComponentManagerService } from '../../../meeting/services/meeting-webcomponent-manager.service';

@Component({
	selector: 'ov-error',
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
		protected wcManagerService: MeetingWebComponentManagerService
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
		const reasonMap: { [key in NavigationErrorReason]: { title: string; message: string } } = {
			[NavigationErrorReason.CLOSED_ROOM]: {
				title: 'Closed room',
				message: 'The room you are trying to access is closed'
			},
			[NavigationErrorReason.MISSING_ROOM_SECRET]: {
				title: 'Invalid link',
				message:
					'The link you used to access this room is not valid. Please ask the moderator to share the correct link using the share buttons available in the room. Note: Sharing the URL from the browser address bar is not valid'
			},
			[NavigationErrorReason.MISSING_RECORDING_SECRET]: {
				title: 'Invalid link',
				message: 'The link you used to access this recording is not valid'
			},
			[NavigationErrorReason.INVALID_ROOM_SECRET]: {
				title: 'Invalid link',
				message:
					'The link you used to access this room is not valid. Please ask the moderator to share the correct link using the share buttons available in the room. Note: Sharing the URL from the browser address bar is not valid'
			},
			[NavigationErrorReason.INVALID_RECORDING_SECRET]: {
				title: 'Invalid link',
				message: 'The link you used to access this recording is not valid'
			},
			[NavigationErrorReason.INVALID_ROOM]: {
				title: 'Invalid room',
				message: 'The room you are trying to access does not exist or has been deleted'
			},
			[NavigationErrorReason.INVALID_RECORDING]: {
				title: 'Invalid recording',
				message: 'The recording you are trying to access does not exist or has been deleted'
			},
			[NavigationErrorReason.UNAUTHORIZED_RECORDING_ACCESS]: {
				title: 'Unauthorized recording access',
				message: 'You are not authorized to access the recordings in this room'
			},
			[NavigationErrorReason.INTERNAL_ERROR]: {
				title: 'Internal error',
				message: 'An unexpected error occurred, please try again later'
			}
		};

		const normalizedReason = Object.values(NavigationErrorReason).find((enumValue) => enumValue === reason) as
			| NavigationErrorReason
			| undefined;
		return reasonMap[normalizedReason ?? NavigationErrorReason.INTERNAL_ERROR];
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
	 * If the redirect URL is set, it navigates to that URL
	 * If in standalone mode without a redirect URL, it navigates to the admin console
	 */
	async goBack() {
		if (this.appDataService.isEmbeddedMode()) {
			this.wcManagerService.close();
		}

		const redirectTo = this.navService.getLeaveRedirectURL();
		if (redirectTo) {
			// Navigate to the specified redirect URL
			await this.navService.redirectToLeaveUrl();
			return;
		}

		if (this.appDataService.isStandaloneMode()) {
			// Navigate to the admin console
			await this.navService.navigateTo('/overview', undefined, true);
		}
	}
}
