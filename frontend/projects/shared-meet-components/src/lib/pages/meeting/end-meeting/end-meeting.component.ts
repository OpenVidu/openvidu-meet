
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { AppDataService, AuthService, NavigationService, WebComponentManagerService } from '@lib/services';
import { LeftEventReason } from '@lib/typings/ce';

@Component({
    selector: 'ov-end-meeting',
    imports: [MatCardModule, MatButtonModule, MatIconModule],
    templateUrl: './end-meeting.component.html',
    styleUrl: './end-meeting.component.scss'
})
export class EndMeetingComponent implements OnInit {
	disconnectedTitle = 'You Left the Meeting';
	disconnectReason = 'You have successfully left the meeting';

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
		this.setDisconnectReason();
		this.setBackButtonText();
	}

	/**
	 * Retrieves the disconnect reason from URL query parameters
	 */
	private setDisconnectReason() {
		const reason = this.route.snapshot.queryParams['reason'];
		if (reason) {
			const { title, message } = this.mapReasonToTitleAndMessage(reason);
			this.disconnectedTitle = title;
			this.disconnectReason = message;
		}
	}

	/**
	 * Maps technical disconnect reasons to user-friendly titles and messages
	 */
	private mapReasonToTitleAndMessage(reason: string): { title: string; message: string } {
		const reasonMap: { [key in LeftEventReason]: { title: string; message: string } } = {
			[LeftEventReason.VOLUNTARY_LEAVE]: {
				title: 'You Left the Meeting',
				message: 'You have successfully left the meeting'
			},
			[LeftEventReason.PARTICIPANT_KICKED]: {
				title: 'Kicked from Meeting',
				message: 'You were kicked from the meeting by a moderator'
			},
			[LeftEventReason.MEETING_ENDED]: {
				title: 'Meeting Ended',
				message: 'The meeting was ended by a moderator'
			},
			[LeftEventReason.MEETING_ENDED_BY_SELF]: {
				title: 'Meeting Ended',
				message: 'You have successfully ended the meeting'
			},
			[LeftEventReason.NETWORK_DISCONNECT]: {
				title: 'Disconnected from Meeting',
				message: 'Connection lost due to network connectivity issues'
			},
			[LeftEventReason.SERVER_SHUTDOWN]: {
				title: 'Disconnected from Meeting',
				message: 'Connection lost due to server shutdown'
			},
			[LeftEventReason.UNKNOWN]: {
				title: 'Disconnected from Meeting',
				message: 'Some unexpected error occurred, please try again later'
			}
		};

		const normalizedReason = Object.values(LeftEventReason).find((enumValue) => enumValue === reason) as
			| LeftEventReason
			| undefined;
		return reasonMap[normalizedReason ?? LeftEventReason.UNKNOWN];
	}

	/**
	 * Sets the back button text based on the application mode and user role
	 */
	private async setBackButtonText() {
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
