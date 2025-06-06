import { Component } from '@angular/core';
import { ConsoleNavComponent } from '../../components/console-nav/console-nav.component';
import { ConsoleNavLink } from '../../models/sidenav.model';
import { AuthService } from '../../services';

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
		{ label: 'Rooms', route: 'rooms', icon: 'video_chat' },
		{ label: 'Recordings', route: 'recordings', icon: 'video_library' },
		{ label: 'Developers', route: 'access-permissions', icon: 'code' },
		{ label: 'Settings', route: 'appearance', icon: 'settings' },

		{ label: 'About', route: 'about', icon: 'info' }
	];

	constructor(private authService: AuthService) {}

	async logout() {
		await this.authService.logout();
	}
}
