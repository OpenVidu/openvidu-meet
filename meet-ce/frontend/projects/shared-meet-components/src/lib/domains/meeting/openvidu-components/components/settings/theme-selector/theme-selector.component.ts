import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MeetingThemeMode } from '../../../models/theme.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MeetingThemeService } from '../../../services/theme/meeting-theme.service';

@Component({
	selector: 'ov-theme-selector',
	imports: [MatIconModule, TranslatePipe],
	template: `
		<div class="theme-options" role="radiogroup" [attr.aria-label]="'PANEL.SETTINGS.THEME' | translate">
			@for (theme of themes; track theme.mode) {
				<button
					role="radio"
					class="segment"
					[id]="'theme-' + theme.mode"
					[attr.aria-checked]="currentTheme() === theme.mode"
					(click)="setTheme(theme.mode)"
				>
					<mat-icon>{{ theme.icon }}</mat-icon>
					<span>{{ theme.labelKey | translate }}</span>
				</button>
			}
		</div>
	`,
	styleUrl: './theme-selector.component.scss'
})
export class ThemeSelectorComponent {
	private readonly themeService = inject(MeetingThemeService);

	protected readonly themes = [
		{ mode: MeetingThemeMode.Light, icon: 'light_mode', labelKey: 'PANEL.SETTINGS.THEME_LIGHT' },
		{ mode: MeetingThemeMode.Dark, icon: 'dark_mode', labelKey: 'PANEL.SETTINGS.THEME_DARK' }
	];
	protected readonly currentTheme = this.themeService.currentTheme;

	setTheme(theme: MeetingThemeMode) {
		this.themeService.setTheme(theme);
	}
}
