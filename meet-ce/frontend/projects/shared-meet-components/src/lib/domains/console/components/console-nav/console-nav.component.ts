import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, Signal, ViewChild } from '@angular/core';
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
		CommonModule,
		MatToolbarModule,
		MatListModule,
		MatButtonModule,
		MatIconModule,
		MatSidenavModule,
		MatTooltipModule,
		RouterModule
	],
	templateUrl: './console-nav.component.html',
	styleUrl: './console-nav.component.scss'
})
export class ConsoleNavComponent {
	@ViewChild(MatSidenav) sidenav!: MatSidenav;
	isMobile = false;
	isTablet = false;
	isSideMenuCollapsed = false;
	version = '';

	isDarkMode: Signal<boolean>;

	@Input() navLinks: ConsoleNavLink[] = [];
	@Output() onLogoutClicked: EventEmitter<void> = new EventEmitter<void>();

	constructor(
		private appCtxService: AppContextService,
		private themeService: ThemeService
	) {
		this.version = `v${this.appCtxService.version()} (${this.appCtxService.edition()})`;
		this.isDarkMode = this.themeService.isDark;
	}

	async toggleSideMenu() {
		if (this.isMobile) {
			this.isSideMenuCollapsed = false;
			await this.sidenav.toggle();
		} else {
			this.isSideMenuCollapsed = !this.isSideMenuCollapsed;
			await this.sidenav.open();
		}
	}

	toggleTheme() {
		this.themeService.toggleTheme();
	}
}
