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
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GlobalConfigService, NotificationService } from '@lib/services';
import { MeetAppearanceConfig, MeetRoomTheme, MeetRoomThemeMode } from '@lib/typings/ce';
import { OPENVIDU_COMPONENTS_DARK_THEME, OPENVIDU_COMPONENTS_LIGHT_THEME } from 'openvidu-components-angular';

type ColorField = 'backgroundColor' | 'primaryColor' | 'secondaryColor' | 'accentColor' | 'surfaceColor';

interface ThemeColors {
	backgroundColor: string;
	primaryColor: string;
	secondaryColor: string;
	accentColor: string;
	surfaceColor: string;
}

@Component({
    selector: 'ov-config',
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
	hasFormChanges = signal(false);
	hasColorChanges = signal(false);

	appearanceForm = new FormGroup({
		enabled: new FormControl<boolean>(false, { nonNullable: true }),
		baseTheme: new FormControl<MeetRoomThemeMode>(MeetRoomThemeMode.LIGHT, {
			validators: [Validators.required],
			nonNullable: true
		}),
		backgroundColor: new FormControl<string>('', { nonNullable: true }),
		primaryColor: new FormControl<string>('', { nonNullable: true }),
		secondaryColor: new FormControl<string>('', { nonNullable: true }),
		accentColor: new FormControl<string>('', { nonNullable: true }),
		surfaceColor: new FormControl<string>('', { nonNullable: true })
	});

	baseThemeOptions: MeetRoomThemeMode[] = [MeetRoomThemeMode.LIGHT, MeetRoomThemeMode.DARK];

	// Color picker configuration
	colorFields: Array<{ key: ColorField; label: string; description: string }> = [
		{
			key: 'backgroundColor',
			label: 'Meeting background',
			description: 'Sets the background color of your meeting screen'
		},
		{
			key: 'primaryColor',
			label: 'Main controls',
			description: 'Colors for the main control buttons (mic, camera, etc.)'
		},
		{
			key: 'secondaryColor',
			label: 'Secondary elements',
			description: 'Colors for logos, icons, borders and subtle details'
		},
		{
			key: 'accentColor',
			label: 'Highlights & accents',
			description: 'Colors for active states and highlighted items'
		},
		{
			key: 'surfaceColor',
			label: 'Panels & dialogs',
			description: 'Background color for side panels and dialog boxes'
		}
	];

	private initialFormValue: MeetRoomTheme | null = null;

	// Default color values based on theme
	private readonly defaultColors: Record<MeetRoomThemeMode, ThemeColors> = {
		[MeetRoomThemeMode.LIGHT]: {
			backgroundColor: OPENVIDU_COMPONENTS_LIGHT_THEME['--ov-background-color'] as string,
			primaryColor: OPENVIDU_COMPONENTS_LIGHT_THEME['--ov-primary-action-color'] as string,
			secondaryColor: OPENVIDU_COMPONENTS_LIGHT_THEME['--ov-secondary-action-color'] as string,
			accentColor: OPENVIDU_COMPONENTS_LIGHT_THEME['--ov-accent-action-color'] as string,
			surfaceColor: OPENVIDU_COMPONENTS_LIGHT_THEME['--ov-surface-color'] as string
		},
		[MeetRoomThemeMode.DARK]: {
			backgroundColor: OPENVIDU_COMPONENTS_DARK_THEME['--ov-background-color'] as string,
			primaryColor: OPENVIDU_COMPONENTS_DARK_THEME['--ov-primary-action-color'] as string,
			secondaryColor: OPENVIDU_COMPONENTS_DARK_THEME['--ov-secondary-action-color'] as string,
			accentColor: OPENVIDU_COMPONENTS_DARK_THEME['--ov-accent-action-color'] as string,
			surfaceColor: OPENVIDU_COMPONENTS_DARK_THEME['--ov-surface-color'] as string
		}
	};

	private lastBaseThemeValue: MeetRoomThemeMode | null = null;
	private isUpdatingColors = false; // Flag to prevent infinite loops

	constructor(
		private configService: GlobalConfigService,
		private notificationService: NotificationService
	) {
		// Track form changes
		this.appearanceForm.valueChanges.subscribe(() => {
			// Prevent infinite loops when updating colors programmatically
			if (!this.isUpdatingColors) {
				this.checkForChanges();
			}
		});
	}

	async ngOnInit() {
		this.isLoading.set(true);
		try {
			await this.loadAppearanceConfig();
		} catch (error) {
			console.error('Error during component initialization:', error);
			this.notificationService.showSnackbar('Failed to load visual settings');
		} finally {
			this.isLoading.set(false);
		}
	}

	// Form state getters
	get isThemeEnabled(): boolean {
		return this.appearanceForm.get('enabled')?.value ?? false;
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

	/**
	 *
	 * Checks if a color was customized from the current theme defaults
	 * @param colorField
	 * @returns
	 */
	hasCustomColor(colorField: ColorField): boolean {
		const formValue = this.appearanceForm.get(colorField)?.value;
		const baseTheme = this.appearanceForm.get('baseTheme')?.value || MeetRoomThemeMode.LIGHT;
		return formValue?.trim() !== '' && formValue !== this.defaultColors[baseTheme][colorField];
	}

	/**
	 * Checks if a color was customized from the last theme defaults
	 * @param colorField The color field to check
	 * @returns true if the color differs from the last theme's default
	 */
	private wasColorCustomizedFromLastTheme(colorField: ColorField): boolean {
		if (!this.lastBaseThemeValue) return false;

		const defaultValue = this.defaultColors[this.lastBaseThemeValue][colorField];
		const currentValue = this.appearanceForm.get(colorField)?.value?.trim() || '';

		return currentValue !== '' && currentValue !== defaultValue;
	}

	// Configuration management
	private async loadAppearanceConfig(): Promise<void> {
		try {
			const { appearance } = await this.configService.getRoomsAppearanceConfig();

			if (appearance.themes.length > 0) {
				const themeConfig = appearance.themes[0];
				this.appearanceForm.patchValue({
					enabled: themeConfig.enabled,
					baseTheme: themeConfig.baseTheme,
					backgroundColor: themeConfig.backgroundColor || '',
					primaryColor: themeConfig.primaryColor || '',
					secondaryColor: themeConfig.secondaryColor || '',
					accentColor: themeConfig.accentColor || '',
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
					accentColor: '',
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
				accentColor: '',
				surfaceColor: ''
			});
			this.storeInitialValues();
			throw error;
		}
	}

	private storeInitialValues(): void {
		this.initialFormValue = { ...this.appearanceForm.value } as MeetRoomTheme;
		this.lastBaseThemeValue = this.initialFormValue.baseTheme;
		this.hasFormChanges.set(false);
		this.hasColorChanges.set(false);
	}

	private checkForChanges(): void {
		if (!this.initialFormValue) return;

		this.handleThemeChange();
		this.updateColorChangesState();
		this.updateFormChangeState();
	}

	private updateFormChangeState(): void {
		const currentFormValue = this.appearanceForm.value;
		const hasChanges = JSON.stringify(currentFormValue) !== JSON.stringify(this.initialFormValue);
		this.hasFormChanges.set(hasChanges);
	}

	/**
	 * Handles theme change by updating non-customized colors
	 */
	private handleThemeChange(): void {
		const newBaseTheme = this.appearanceForm.value.baseTheme || MeetRoomThemeMode.LIGHT;
		if (newBaseTheme === this.lastBaseThemeValue) return;

		const newDefaults = this.defaultColors[newBaseTheme];

		// Build update object with only non-customized colors
		const updatedColors = this.colorFields.reduce((acc, { key }) => {
			if (!this.wasColorCustomizedFromLastTheme(key)) {
				acc[key] = newDefaults[key];
			}
			return acc;
		}, {} as Partial<MeetRoomTheme>);

		// Check if there are any colors to update
		if (Object.keys(updatedColors).length === 0) {
			return;
		}

		// Apply updates atomically
		this.applyColorUpdates(updatedColors, newBaseTheme);
	}

	/**
	 * Applies color updates without triggering infinite loops
	 */
	private applyColorUpdates(updatedColors: Partial<MeetRoomTheme>, newBaseTheme: MeetRoomThemeMode): void {
		this.isUpdatingColors = true;
		this.appearanceForm.patchValue(updatedColors);
		this.lastBaseThemeValue = newBaseTheme;
		this.isUpdatingColors = false;
	}

	/**
	 * Updates color changes state efficiently
	 */
	private updateColorChangesState(): void {
		const colorKeys: ColorField[] = this.colorFields.map((field) => field.key);
		const hasColorChanges = colorKeys.some((key) => this.appearanceForm.value[key] !== this.initialFormValue![key]);
		this.hasColorChanges.set(hasColorChanges);
	}

	onToggleTheme(event: MatSlideToggleChange): void {
		// If theme was initially enabled and now disabled, save immediately
		if (this.initialFormValue?.enabled && !event.checked) {
			this.appearanceForm.patchValue({ ...this.initialFormValue, enabled: false });
			this.onSaveAppearanceConfig();
		}
	}

	onResetColors(): void {
		if (this.initialFormValue) {
			this.appearanceForm.patchValue({
				backgroundColor: this.initialFormValue.backgroundColor,
				primaryColor: this.initialFormValue.primaryColor,
				secondaryColor: this.initialFormValue.secondaryColor,
				accentColor: this.initialFormValue.accentColor,
				surfaceColor: this.initialFormValue.surfaceColor
			});
			this.hasColorChanges.set(false);
		}
	}

	async onSaveAppearanceConfig(): Promise<void> {
		if (this.appearanceForm.invalid) {
			this.notificationService.showSnackbar('Please fix the form errors before saving');
			return;
		}

		const formData = this.appearanceForm.value;

		try {
			const appearanceConfig: MeetAppearanceConfig = {
				themes: [this.createThemeFromFormData(formData as MeetRoomTheme)]
			};

			await this.configService.saveRoomsAppearanceConfig(appearanceConfig);
			this.notificationService.showSnackbar('Visual settings saved successfully');
			this.storeInitialValues();
		} catch (error) {
			console.error('Error saving appearance config:', error);
			this.notificationService.showSnackbar('Failed to save visual settings');
		}
	}

	private createThemeFromFormData(formData: MeetRoomTheme): MeetRoomTheme {
		const baseTheme = formData.baseTheme ?? MeetRoomThemeMode.LIGHT;
		const defaults = this.defaultColors[baseTheme];

		return {
			name: 'default',
			enabled: formData.enabled,
			baseTheme,
			backgroundColor: formData.backgroundColor?.trim() || defaults.backgroundColor,
			primaryColor: formData.primaryColor?.trim() || defaults.primaryColor,
			secondaryColor: formData.secondaryColor?.trim() || defaults.secondaryColor,
			accentColor: formData.accentColor?.trim() || defaults.accentColor,
			surfaceColor: formData.surfaceColor?.trim() || defaults.surfaceColor
		};
	}
}
