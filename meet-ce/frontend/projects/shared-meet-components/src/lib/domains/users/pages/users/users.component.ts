import { Component, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
	selector: 'ov-users',
	imports: [MatProgressSpinnerModule, MatIconModule],
	templateUrl: './users.component.html',
	styleUrl: './users.component.scss'
})
export class UsersComponent {
	isLoading = signal(false);
}
