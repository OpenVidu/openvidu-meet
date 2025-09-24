import { Component, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GlobalConfigService, NotificationService } from '@lib/services';
import { MeetAppearanceConfig, MeetRoomTheme, MeetRoomThemeMode } from '@lib/typings/ce';
import {
	OPENVIDU_COMPONENTS_DARK_THEME,
	OPENVIDU_COMPONENTS_LIGHT_THEME,
	OpenViduThemeService
} from 'openvidu-components-angular';

type ColorField = 'backgroundColor' | 'primaryColor' | 'secondaryColor' | 'surfaceColor';

interface ThemeColors {
	backgroundColor: string;
	primaryColor: string;
	secondaryColor: string;
	surfaceColor: string;
}

@Component({
	selector: 'ov-config',
	standalone: true,
	imports: [
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatSelectModule,
		MatSlideToggleModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatDividerModule,
		ReactiveFormsModule
	],
	templateUrl: './config.component.html',
	styleUrl: './config.component.scss'
})
export class ConfigComponent implements OnInit {
	isLoading = signal(true);
	hasChanges = signal(false);

	appearanceForm = new FormGroup({
		enabled: new FormControl<boolean>(false, { nonNullable: true }),
		baseTheme: new FormControl<MeetRoomThemeMode>(MeetRoomThemeMode.LIGHT, {
			validators: [Validators.required],
			nonNullable: true
		}),
		backgroundColor: new FormControl<string>('', { nonNullable: true }),
		primaryColor: new FormControl<string>('', { nonNullable: true }),
		secondaryColor: new FormControl<string>('', { nonNullable: true }),
		surfaceColor: new FormControl<string>('', { nonNullable: true })
	});

	baseThemeOptions: MeetRoomThemeMode[] = [MeetRoomThemeMode.LIGHT, MeetRoomThemeMode.DARK];

	// Color picker configuration
	colorFields: Array<{ key: ColorField; label: string }> = [
		{ key: 'backgroundColor', label: 'Background' },
		{ key: 'primaryColor', label: 'Primary' },
		{ key: 'secondaryColor', label: 'Secondary' },
		{ key: 'surfaceColor', label: 'Surface' }
	];

	private initialFormValue: MeetRoomTheme | null = null;

	// Default color values based on theme
	private readonly defaultColors: Record<MeetRoomThemeMode, ThemeColors> = {
		[MeetRoomThemeMode.LIGHT]: {
			backgroundColor: OPENVIDU_COMPONENTS_LIGHT_THEME['--ov-background-color'] as string,
			primaryColor: OPENVIDU_COMPONENTS_LIGHT_THEME['--ov-primary-action-color'] as string,
			secondaryColor: OPENVIDU_COMPONENTS_LIGHT_THEME['--ov-secondary-action-color'] as string,
			surfaceColor: OPENVIDU_COMPONENTS_LIGHT_THEME['--ov-surface-color'] as string
		},
		[MeetRoomThemeMode.DARK]: {
			backgroundColor: OPENVIDU_COMPONENTS_DARK_THEME['--ov-background-color'] as string,
			primaryColor: OPENVIDU_COMPONENTS_DARK_THEME['--ov-primary-action-color'] as string,
			secondaryColor: OPENVIDU_COMPONENTS_DARK_THEME['--ov-secondary-action-color'] as string,
			surfaceColor: OPENVIDU_COMPONENTS_DARK_THEME['--ov-surface-color'] as string
		}
	};

	constructor(
		private configService: GlobalConfigService,
		private notificationService: NotificationService
	) {
		// Track form changes
		this.appearanceForm.valueChanges.subscribe(() => {
			this.checkForChanges();
		});
	}

	async ngOnInit() {
		this.isLoading.set(true);
		try {
			await this.loadAppearanceConfig();
		} catch (error) {
			console.error('Error during component initialization:', error);
			this.notificationService.showSnackbar('Failed to initialize theme configuration');
		} finally {
			this.isLoading.set(false);
		}
	}

	// Form state getters
	get isThemeEnabled(): boolean {
		return this.appearanceForm.get('enabled')?.value ?? false;
	}

	// Form actions
	onResetForm(): void {
		if (this.initialFormValue) {
			this.appearanceForm.patchValue(this.initialFormValue);
			this.hasChanges.set(false);
		}
	}

	// Color management methods
	getColorValue(colorField: ColorField): string {
		const formValue = this.appearanceForm.get(colorField)?.value;
		if (formValue?.trim()) {
			return formValue;
		}

		const baseTheme = this.appearanceForm.get('baseTheme')?.value || MeetRoomThemeMode.LIGHT;
		return this.defaultColors[baseTheme][colorField];
	}

	focusColorInput(colorField: ColorField): void {
		const inputElement = document.getElementById(colorField) as HTMLInputElement;
		inputElement?.click();
	}

	hasCustomColor(colorField: ColorField): boolean {
		const formValue = this.appearanceForm.get(colorField)?.value;
		return Boolean(formValue?.trim());
	}

	// Configuration management
	private async loadAppearanceConfig(): Promise<void> {
		try {
			const { appearance } = await this.configService.getRoomsAppearanceConfig();
			const themeConfig = appearance?.themes?.[0];

			if (themeConfig) {
				this.appearanceForm.patchValue({
					enabled: themeConfig.enabled,
					baseTheme: themeConfig.baseTheme,
					backgroundColor: themeConfig.backgroundColor || '',
					primaryColor: themeConfig.primaryColor || '',
					secondaryColor: themeConfig.secondaryColor || '',
					surfaceColor: themeConfig.surfaceColor || ''
				});
			} else {
				// Set default values
				this.appearanceForm.patchValue({
					enabled: false,
					baseTheme: MeetRoomThemeMode.LIGHT,
					backgroundColor: '',
					primaryColor: '',
					secondaryColor: '',
					surfaceColor: ''
				});
			}

			this.storeInitialValues();
		} catch (error) {
			console.error('Error loading appearance config:', error);
			this.appearanceForm.patchValue({
				enabled: false,
				baseTheme: MeetRoomThemeMode.LIGHT,
				backgroundColor: '',
				primaryColor: '',
				secondaryColor: '',
				surfaceColor: ''
			});
			this.storeInitialValues();
			throw error;
		}
	}

	private storeInitialValues(): void {
		this.initialFormValue = { ...this.appearanceForm.value } as MeetRoomTheme;
		this.hasChanges.set(false);
	}

	private checkForChanges(): void {
		if (!this.initialFormValue) {
			return;
		}

		const currentValue = this.appearanceForm.value;
		const hasChangesDetected = JSON.stringify(currentValue) !== JSON.stringify(this.initialFormValue);
		this.hasChanges.set(hasChangesDetected);
		if (!currentValue.enabled) {
			this.onSaveAppearanceConfig();
		}
	}

	async onSaveAppearanceConfig(): Promise<void> {
		if (this.appearanceForm.invalid) {
			this.notificationService.showSnackbar('Please fix form errors before saving');
			return;
		}

		const formData = this.appearanceForm.value;

		try {
			const appearanceConfig: MeetAppearanceConfig = {
				themes: [this.createThemeFromFormData(formData as MeetRoomTheme)]
			};

			await this.configService.saveRoomsAppearanceConfig(appearanceConfig);
			this.notificationService.showSnackbar('Theme configuration saved successfully');
			this.storeInitialValues();
		} catch (error) {
			console.error('Error saving appearance config:', error);
			this.notificationService.showSnackbar('Failed to save theme configuration');
		}
	}

	private createThemeFromFormData(formData: MeetRoomTheme): MeetRoomTheme {
		const baseTheme = formData.baseTheme ?? MeetRoomThemeMode.LIGHT;
		const defaults = this.defaultColors[baseTheme];

		return {
			enabled: formData.enabled,
			name: 'default',
			baseTheme,
			backgroundColor: formData.backgroundColor?.trim() ? formData.backgroundColor : defaults.backgroundColor,
			primaryColor: formData.primaryColor?.trim() ? formData.primaryColor : defaults.primaryColor,
			secondaryColor: formData.secondaryColor?.trim() ? formData.secondaryColor : defaults.secondaryColor,
			surfaceColor: formData.surfaceColor?.trim() ? formData.surfaceColor : defaults.surfaceColor
		};
	}
}
