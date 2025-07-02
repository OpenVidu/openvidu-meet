import { Component, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute } from '@angular/router';
import { ErrorReason } from '@lib/models';

@Component({
	selector: 'ov-error',
	standalone: true,
	imports: [MatCardModule],
	templateUrl: './error.component.html',
	styleUrl: './error.component.scss'
})
export class ErrorComponent implements OnInit {
	errorName = 'Error';
	message = '';

	constructor(private route: ActivatedRoute) {}

	ngOnInit(): void {
		this.route.queryParams.subscribe((params) => {
			const reason = params['reason'];
			switch (reason) {
				case ErrorReason.MISSING_ROOM_SECRET:
					this.errorName = 'Missing secret';
					this.message = 'You need to provide a secret to join the room as a moderator or publisher';
					break;
				case ErrorReason.MISSING_RECORDING_SECRET:
					this.errorName = 'Missing secret';
					this.message = 'You need to provide a secret to access the recording';
					break;
				case ErrorReason.INVALID_ROOM_SECRET:
					this.errorName = 'Invalid secret';
					this.message =
						'The secret provided to join the room is neither valid for moderators nor publishers';
					break;
				case ErrorReason.INVALID_RECORDING_SECRET:
					this.errorName = 'Invalid secret';
					this.message = 'The secret provided to access the recording is invalid';
					break;
				case ErrorReason.INVALID_ROOM:
					this.errorName = 'Invalid room';
					this.message = 'The room you are trying to join does not exist or has been deleted';
					break;
				case ErrorReason.INVALID_RECORDING:
					this.errorName = 'Invalid recording';
					this.message = 'The recording you are trying to access does not exist or has been deleted';
					break;
				case ErrorReason.NO_RECORDINGS:
					this.errorName = 'No recordings';
					this.message = 'There are no recordings in this room or the room does not exist';
					break;
				case ErrorReason.UNAUTHORIZED_RECORDING_ACCESS:
					this.errorName = 'Unauthorized recording access';
					this.message = 'You are not authorized to access the recordings in this room';
					break;
				case ErrorReason.RECORDINGS_ADMIN_ONLY_ACCESS:
					this.errorName = 'Unauthorized recording access';
					this.message = 'Recordings access is configured for admins only in this room';
					break;
				default:
					this.errorName = 'Internal error';
					this.message = 'Something went wrong...';
					break;
			}
		});
	}
}
