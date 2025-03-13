import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
	selector: 'ov-unauthorized',
	standalone: true,
	imports: [],
	templateUrl: './unauthorized.component.html',
	styleUrl: './unauthorized.component.scss'
})
export class UnauthorizedComponent implements OnInit {
	message = 'Unauthorized access';
	constructor(private route: ActivatedRoute) {}

	ngOnInit(): void {
		this.route.queryParams.subscribe((params) => {
			const reason = params['reason'];
			switch (reason) {
				case 'invalid-token':
					this.message = 'The token provided is not valid';
					break;
				case 'invalid-room':
					this.message = 'The room name is not valid';
					break;
				case 'invalid-participant':
					this.message = 'The participant name must be provided';
					break;
				case 'unauthorized-participant':
					this.message = 'You are not authorized to join this room';
					break;

				default:
					this.message = 'Unauthorized access';
					break;
			}
		});
	}
}
