import { Component } from '@angular/core';
import { ConsoleNavLink } from '../../../../shared/models/sidenav.model';
import { AuthService } from '../../../auth/services/auth.service';
import { ConsoleNavComponent } from '../../components/console-nav/console-nav.component';

@Component({
	selector: 'ov-console',
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
		{
			label: 'Users & Permissions',
			route: 'users-permissions',
			icon: 'passkey',
			iconClass: 'ov-users-permissions material-symbols-outlined'
		},
		{ label: 'Configuration', route: 'config', icon: 'settings', iconClass: 'ov-settings-icon' }

		// { label: 'About', route: 'about', icon: 'info' }
	];

	constructor(private authService: AuthService) {}

	async logout() {
		await this.authService.logout();
	}
}
