import { Component } from '@angular/core';
import { ConsoleNavComponent } from '@lib/components';
import { ConsoleNavLink } from '@lib/models';
import { AuthService } from '@lib/services';

@Component({
	selector: 'app-console',
	standalone: true,
	imports: [ConsoleNavComponent],
	templateUrl: './console.component.html',
	styleUrl: './console.component.scss'
})
export class ConsoleComponent {
	navLinks: ConsoleNavLink[] = [
		{ label: 'Overview', route: 'overview', icon: 'dashboard' },
		{ label: 'Rooms', route: 'rooms', icon: 'video_chat', iconClass: 'ov-room-icon' },
		{ label: 'Recordings', route: 'recordings', icon: 'video_library', iconClass: 'ov-recording-icon' },
		{
			label: 'Embedded',
			route: 'embedded',
			icon: 'code_blocks',
			iconClass: 'material-symbols-outlined ov-developer-icon'
		},
		{ label: 'Users & Permissions', route: 'users-permissions', icon: 'passkey', iconClass: 'ov-settings-icon material-symbols-outlined' }

		// { label: 'About', route: 'about', icon: 'info' }
	];

	constructor(private authService: AuthService) {}

	async logout() {
		await this.authService.logout();
	}
}
