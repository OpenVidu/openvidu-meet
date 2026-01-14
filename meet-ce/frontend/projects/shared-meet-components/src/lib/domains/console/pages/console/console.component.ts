import { Component } from '@angular/core';
import { ConsoleNavLink } from '../../../../shared/models/sidenav.model';
import { AuthService } from '../../../auth/services/auth.service';
import { ConsoleNavComponent } from '../../components/console-nav/console-nav.component';
import { consoleChildRoutes } from '../../routes/console.routes';

@Component({
	selector: 'ov-console',
	imports: [ConsoleNavComponent],
	templateUrl: './console.component.html',
	styleUrl: './console.component.scss'
})
export class ConsoleComponent {
	navLinks: ConsoleNavLink[];

	constructor(private authService: AuthService) {
		// Build navigation links from console child route configurations
		this.navLinks = consoleChildRoutes
			.filter((config) => config.navMetadata) // Only include routes with navigation metadata
			.map((config) => ({
				label: config.navMetadata!.label,
				route: config.navMetadata!.route,
				icon: config.navMetadata!.icon,
				iconClass: config.navMetadata?.iconClass
			}))
			.sort((a, b) => {
				// Sort by order if available
				const orderA = consoleChildRoutes.find((r) => r.navMetadata?.route === a.route)?.navMetadata?.order ?? 999;
				const orderB = consoleChildRoutes.find((r) => r.navMetadata?.route === b.route)?.navMetadata?.order ?? 999;
				return orderA - orderB;
			});
	}

	async logout() {
		await this.authService.logout();
	}
}
