import { Clipboard } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetApiKey } from '@lib/typings/ce';
import { AuthService, GlobalPreferencesService, NotificationService } from '../../../services';

@Component({
	selector: 'ov-developers-settings',
	standalone: true,
	imports: [
		CommonModule,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatSlideToggleModule,
		MatSnackBarModule,
		MatTooltipModule,
		MatDividerModule,
		ReactiveFormsModule
	],
	templateUrl: './developers.component.html',
	styleUrl: './developers.component.scss'
})
export class DevelopersSettingsComponent implements OnInit {
	apiKeyData = signal<MeetApiKey | undefined>(undefined);
	showApiKey = signal(false);

	webhookForm = new FormGroup({
		isEnabled: new FormControl(false),
		url: new FormControl('', [Validators.required, Validators.pattern(/^https?:\/\/.+/)])
		// roomCreated: [true],
		// roomDeleted: [true],
		// participantJoined: [false],
		// participantLeft: [false],
		// recordingStarted: [true],
		// recordingFinished: [true]
	});

	constructor(
		protected authService: AuthService,
		protected preferencesService: GlobalPreferencesService,
		protected notificationService: NotificationService,
		protected clipboard: Clipboard
	) {
		// Disable url field initially and enable/disable based on isEnabled toggle
		this.webhookForm.get('url')?.disable();
		this.webhookForm.get('isEnabled')?.valueChanges.subscribe((isEnabled) => {
			if (isEnabled) {
				this.webhookForm.get('url')?.enable();
			} else {
				this.webhookForm.get('url')?.disable();
			}
		});
	}

	async ngOnInit() {
		await this.loadApiKeyData();
		await this.loadWebhookConfig();
	}

	// ===== API KEY METHODS =====

	private async loadApiKeyData() {
		try {
			const apiKeys = await this.authService.getApiKeys();
			if (apiKeys.length > 0) {
				const apiKey = apiKeys[0]; // Assuming we only handle one API key
				this.apiKeyData.set(apiKey);
			} else {
				this.apiKeyData.set(undefined);
			}
		} catch (error) {
			console.error('Error loading API key data:', error);
			this.notificationService.showSnackbar('Failed to load API Key data');
			this.apiKeyData.set(undefined);
		}
	}

	async generateApiKey() {
		try {
			const newApiKey = await this.authService.generateApiKey();
			this.apiKeyData.set(newApiKey);
			this.showApiKey.set(true);
			this.notificationService.showSnackbar('API Key generated successfully');
		} catch (error) {
			console.error('Error generating API key:', error);
			this.notificationService.showSnackbar('Failed to generate API Key');
		}
	}

	async regenerateApiKey() {
		await this.generateApiKey();
	}

	toggleApiKeyVisibility() {
		this.showApiKey.set(!this.showApiKey());
	}

	copyApiKey() {
		const apiKey = this.apiKeyData();
		if (apiKey) {
			this.clipboard.copy(apiKey.key);
			this.notificationService.showSnackbar('API Key copied to clipboard');
		}
	}

	async revokeApiKey() {
		try {
			await this.authService.deleteApiKeys();
			this.apiKeyData.set(undefined);
			this.showApiKey.set(false);
			this.notificationService.showSnackbar('API Key revoked successfully');
		} catch (error) {
			console.error('Error revoking API key:', error);
			this.notificationService.showSnackbar('Failed to revoke API Key');
		}
	}

	// ===== WEBHOOK CONFIGURATION METHODS =====

	private async loadWebhookConfig() {
		try {
			const webhookPreferences = await this.preferencesService.getWebhookPreferences();
			this.webhookForm.patchValue({
				isEnabled: webhookPreferences.enabled,
				url: webhookPreferences.url
				// roomCreated: webhookPreferences.events.roomCreated,
				// roomDeleted: webhookPreferences.events.roomDeleted,
				// participantJoined: webhookPreferences.events.participantJoined,
				// participantLeft: webhookPreferences.events.participantLeft,
				// recordingStarted: webhookPreferences.events.recordingStarted,
				// recordingFinished: webhookPreferences.events.recordingFinished
			});
		} catch (error) {
			console.error('Error loading webhook configuration:', error);
			this.notificationService.showSnackbar('Failed to load webhook configuration');
		}
	}

	async saveWebhookConfig() {
		if (!this.webhookForm.valid) return;

		const formValue = this.webhookForm.value;
		const webhookPreferences = {
			enabled: formValue.isEnabled!,
			url: formValue.url ?? undefined
			// events: {
			// 	roomCreated: formValue.roomCreated,
			// 	roomDeleted: formValue.roomDeleted,
			// 	participantJoined: formValue.participantJoined,
			// 	participantLeft: formValue.participantLeft,
			// 	recordingStarted: formValue.recordingStarted,
			// 	recordingFinished: formValue.recordingFinished
			// }
		};

		try {
			await this.preferencesService.saveWebhookPreferences(webhookPreferences);
			this.notificationService.showSnackbar('Webhook configuration saved successfully');
		} catch (error) {
			console.error('Error saving webhook configuration:', error);
			this.notificationService.showSnackbar('Failed to save webhook configuration');
		}
	}

	async testWebhook() {
		const url = this.webhookForm.get('url')?.value;
		if (url) {
			try {
				await this.preferencesService.testWebhookUrl(url);
				this.notificationService.showSnackbar('Test webhook sent successfully. Your URL is reachable.');
			} catch (error) {
				this.notificationService.showSnackbar('Failed to send test webhook. Your URL may not be reachable.');
			}
		}
	}
}
