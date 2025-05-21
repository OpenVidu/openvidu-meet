import { Component, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute } from '@angular/router';

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
				case 'invalid-secret':
					this.errorName = 'Invalid secret';
					this.message =
						'The secret provided to join the room is neither valid for moderators nor publishers';
					break;
				case 'invalid-room':
					this.errorName = 'Invalid room';
					this.message = 'The room you are trying to join does not exist or has been deleted';
					break;
				case 'no-recordings':
					this.errorName = 'No recordings';
					this.message = 'There are no recordings in this room or the room does not exist';
					break;
				case 'unauthorized-recording-access':
					this.errorName = 'Unauthorized recording access';
					this.message = 'You are not authorized to access the recordings in this room';
					break;
				case 'recordings-admin-only-access':
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
