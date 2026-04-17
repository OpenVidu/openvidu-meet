import { ChangeDetectionStrategy, Component, Signal, inject, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { ConsoleNavLink } from '../../../../shared/models/sidenav.model';
import { AppContextService } from '../../../../shared/services/app-context.service';
import { ThemeService } from '../../../../shared/services/theme.service';

@Component({
	selector: 'ov-console-nav',
	imports: [
		MatToolbarModule,
		MatListModule,
		MatButtonModule,
		MatIconModule,
		MatSidenavModule,
		MatTooltipModule,
		RouterModule
	],
	templateUrl: './console-nav.component.html',
	styleUrl: './console-nav.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConsoleNavComponent {
	private appCtxService = inject(AppContextService);
	private themeService = inject(ThemeService);

	readonly sidenav = viewChild.required(MatSidenav);
	isMobile = signal(false);
	isTablet = signal(false);
	isSideMenuCollapsed = signal(false);
	readonly version = `v${this.appCtxService.version()} (${this.appCtxService.edition()})`;

	readonly isDarkMode: Signal<boolean>;

	navLinks = input<ConsoleNavLink[]>([]);
	onLogoutClicked = output<void>();

	constructor() {
		this.isDarkMode = this.themeService.isDark;
	}

	async toggleSideMenu() {
		if (this.isMobile()) {
			this.isSideMenuCollapsed.set(false);
			await this.sidenav().toggle();
		} else {
			this.isSideMenuCollapsed.set(!this.isSideMenuCollapsed());
			await this.sidenav().open();
		}
	}

	toggleTheme() {
		this.themeService.toggleTheme();
	}
}
