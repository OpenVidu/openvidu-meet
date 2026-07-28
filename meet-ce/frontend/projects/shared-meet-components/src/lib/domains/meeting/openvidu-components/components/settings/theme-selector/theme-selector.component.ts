import { Component, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MeetingThemeMode } from '../../../models/theme.model';
import { MeetingThemeService } from '../../../services/theme/meeting-theme.service';

@Component({
	selector: 'ov-theme-selector',
	imports: [MatButtonModule, MatIconModule, MatMenuModule],
	template: `
		<div class="theme-selector-container">
			<button
				mat-flat-button
				[matMenuTriggerFor]="themeMenu"
				aria-haspopup="true"
				aria-label="Select theme"
				class="theme-selector-button"
			>
				<span class="theme-name">
					{{ currentTheme || 'Select theme' }}
					<mat-icon class="expand-icon">expand_more</mat-icon>
				</span>
			</button>

			<!-- Theme selection menu -->
			<mat-menu #themeMenu="matMenu" class="theme-menu">
				@for (theme of predefinedThemes; track theme) {
					<button
						mat-menu-item
						(click)="setTheme(theme)"
						[attr.id]="'theme-' + theme"
						[class.selected]="currentTheme === theme"
						class="theme-option"
					>
						@if (currentTheme === theme) {
							<mat-icon class="check-icon">check</mat-icon>
						}
						<span class="theme-option-name">{{ theme }}</span>
					</button>
				}
			</mat-menu>
		</div>
	`,
	styleUrl: './theme-selector.component.scss'
})
export class ThemeSelectorComponent implements OnInit {
	protected predefinedThemes: MeetingThemeMode[] = [];
	private readonly themeService = inject(MeetingThemeService);

	ngOnInit() {
		this.predefinedThemes = this.themeService.getAllThemes();
	}

	get currentTheme() {
		return this.themeService.getCurrentTheme();
	}

	setTheme(theme: MeetingThemeMode) {
		this.themeService.setTheme(theme);
	}
}
