import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { LeftEventReason } from '@openvidu-meet/typings';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { AuthService } from '../../../auth/services/auth.service';

@Component({
	selector: 'ov-end-meeting',
	imports: [MatCardModule, MatButtonModule, MatIconModule],
	templateUrl: './end-meeting.component.html',
	styleUrl: './end-meeting.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class EndMeetingComponent implements OnInit {
	private route = inject(ActivatedRoute);
	protected authService = inject(AuthService);
	protected navService = inject(NavigationService);
	protected runtimeConfigService = inject(RuntimeConfigService);

	/** Default OpenVidu logo served as a static asset (resolves in SPA & WC modes). */
	protected readonly logoUrl = this.runtimeConfigService.resolveUrl('assets/images/logo.webp');

	/**
	 * Optional reason override, used when the component is rendered outside
	 * the Angular Router (e.g. inside the Web Component, which has no
	 * routing).
	 */
	readonly reason = input<string | undefined>(undefined);

	disconnectedTitle = signal('You Left the Meeting');
	disconnectReason = signal('You have successfully left the meeting');

	showBackButton = signal(true);
	backButtonText = signal('Back');

	ngOnInit() {
		this.setDisconnectReason();
		this.setBackButtonText();
	}

	/**
	 * Resolves the disconnect reason from (in order): the `reason` input, the
	 * `reason` route query parameter. Falls back to the default title/message
	 * if neither is set.
	 */
	private setDisconnectReason() {
		const reason = this.reason() ?? this.route.snapshot.queryParams['reason'];
		if (reason) {
			const { title, message } = this.mapReasonToTitleAndMessage(reason);
			this.disconnectedTitle.set(title);
			this.disconnectReason.set(message);
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
			[LeftEventReason.DUPLICATE_IDENTITY]: {
				title: 'Disconnected from Meeting',
				message: 'This session was closed because you joined the same meeting from another tab or device'
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
	 * Sets the back button text based on the application mode and user authentication
	 */
	private async setBackButtonText() {
		const isStandaloneMode = !this.runtimeConfigService.isEmbeddedMode();
		const redirection = this.navService.getLeaveRedirectURL();
		const isAuthenticated = await this.authService.isUserAuthenticated();

		// If in standalone mode without redirection and user is not authenticated,
		// hide back button (user has no where to go back to)
		if (isStandaloneMode && !redirection && !isAuthenticated) {
			this.showBackButton.set(false);
			return;
		}

		this.showBackButton.set(true);
		this.backButtonText.set(isStandaloneMode && !redirection && isAuthenticated ? 'Back to Rooms' : 'Accept');
	}

	/**
	 * Back-button handler. Defers WC-vs-SPA branching to
	 * {@link NavigationService.goBackFromMeeting}.
	 */
	async goBack() {
		await this.navService.goBackFromMeeting('/rooms', true);
	}
}
