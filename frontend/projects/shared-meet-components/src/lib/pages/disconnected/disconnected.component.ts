import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';

@Component({
	selector: 'ov-disconnected',
	standalone: true,
	imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule],
	templateUrl: './disconnected.component.html',
	styleUrl: './disconnected.component.scss'
})
export class DisconnectedComponent implements OnInit {
	disconnectReason?: string;

	constructor(private route: ActivatedRoute) {}

	ngOnInit(): void {
		// Get disconnect reason from query parameters
		this.getDisconnectReasonFromQueryParams();
	}

	/**
	 * Retrieves the disconnect reason from URL query parameters
	 */
	private getDisconnectReasonFromQueryParams(): void {
		const reason = this.route.snapshot.queryParams['reason'];
		if (reason) {
			// Map technical reasons to user-friendly messages
			this.disconnectReason = this.mapReasonToUserMessage(reason);
		}
	}

	/**
	 * Maps technical disconnect reasons to user-friendly messages
	 */
	private mapReasonToUserMessage(reason: string): string {
		const reasonMap: { [key: string]: string } = {
			disconnect: 'You have successfully disconnected from the meeting',
			forceDisconnectByUser: 'You were removed from the meeting by meeting host',
			forceDisconnectByServer: 'Your connection was terminated by the server',
			sessionClosedByServer: 'The meeting was ended by the host',
			networkDisconnect: 'Connection lost due to network connectivity issues',
			openviduDisconnect: 'The meeting ended due to technical difficulties',
			roomDeleted: 'The meeting room has been deleted',
			browserClosed: 'The meeting ended when your browser was closed'
		};

		return reasonMap[reason] || reasonMap['disconnect'];
	}
}
