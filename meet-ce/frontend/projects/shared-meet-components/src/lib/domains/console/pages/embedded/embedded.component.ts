import { Clipboard } from '@angular/cdk/clipboard';
import { Component, effect, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetApiKey } from '@openvidu-meet/typings';
import { ApiKeyService } from '../../../../shared/services/api-key.service';
import { GlobalConfigService } from '../../../../shared/services/global-config.service';
import { NotificationService } from '../../../../shared/services/notification.service';

@Component({
	selector: 'ov-embedded',
	imports: [
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatSlideToggleModule,
		MatTooltipModule,
		ReactiveFormsModule,
		MatProgressSpinnerModule
	],
	templateUrl: './embedded.component.html',
	styleUrl: './embedded.component.scss'
})
export class EmbeddedComponent implements OnInit {
	isLoading = signal(true);
	hasWebhookChanges = signal(false);

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

	private initialWebhookFormValue: any = null;

	constructor(
		protected apiKeyService: ApiKeyService,
		protected configService: GlobalConfigService,
		protected notificationService: NotificationService,
		protected clipboard: Clipboard
	) {
		// Disable url field initially and enable/disable based on isEnabled toggle
		const urlControl = this.webhookForm.get('url');
		urlControl?.disable();
		this.webhookForm.get('isEnabled')?.valueChanges.subscribe((isEnabled) => {
			if (isEnabled) {
				urlControl?.enable();
			} else {
				urlControl?.disable();
			}
		});

		// Disable webhook toggle initially and enable/disable based on API key presence
		const webhookToggle = this.webhookForm.get('isEnabled');
		webhookToggle?.disable();
		effect(() => {
			if (this.apiKeyData()) {
				webhookToggle?.enable();
			} else {
				webhookToggle?.disable();
			}
		});

		// Track form changes
		this.webhookForm.valueChanges.subscribe(() => {
			this.checkForWebhookChanges();
		});
	}

	async ngOnInit() {
		this.isLoading.set(true);
		await this.loadApiKeyData();
		await this.loadWebhookConfig();
		this.isLoading.set(false);
	}

	// ===== API KEY METHODS =====

	private async loadApiKeyData() {
		try {
			const apiKeys = await this.apiKeyService.getApiKeys();
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
			const newApiKey = await this.apiKeyService.generateApiKey();
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
			await this.apiKeyService.deleteApiKeys();
			this.apiKeyData.set(undefined);
			this.showApiKey.set(false);

			// Disable webhooks when API key is revoked
			const webhookToggle = this.webhookForm.get('isEnabled');
			if (webhookToggle?.value) {
				webhookToggle.setValue(false);
				await this.saveWebhookConfig();
			}

			this.notificationService.showSnackbar('API Key revoked successfully');
		} catch (error) {
			console.error('Error revoking API key:', error);
			this.notificationService.showSnackbar('Failed to revoke API Key');
		}
	}

	// ===== WEBHOOK CONFIGURATION METHODS =====

	get canEnableWebhooks(): boolean {
		return !!this.apiKeyData();
	}

	private async loadWebhookConfig() {
		try {
			const webhookConfig = await this.configService.getWebhookConfig();
			this.webhookForm.patchValue({
				isEnabled: webhookConfig.enabled,
				url: webhookConfig.url
				// roomCreated: webhookConfig.events.roomCreated,
				// roomDeleted: webhookConfig.events.roomDeleted,
				// participantJoined: webhookConfig.events.participantJoined,
				// participantLeft: webhookConfig.events.participantLeft,
				// recordingStarted: webhookConfig.events.recordingStarted,
				// recordingFinished: webhookConfig.events.recordingFinished
			});

			// Store initial values after loading
			this.initialWebhookFormValue = this.webhookForm.getRawValue();
			this.hasWebhookChanges.set(false);
		} catch (error) {
			console.error('Error loading webhook configuration:', error);
			this.notificationService.showSnackbar('Failed to load webhook configuration');
		}
	}

	private checkForWebhookChanges() {
		if (!this.initialWebhookFormValue) {
			return;
		}

		const currentValue = this.webhookForm.getRawValue();
		const hasChanges = JSON.stringify(currentValue) !== JSON.stringify(this.initialWebhookFormValue);
		this.hasWebhookChanges.set(hasChanges);
	}

	async saveWebhookConfig() {
		if (!this.webhookForm.valid) return;

		const formValue = this.webhookForm.value;
		const webhookConfig = {
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
			await this.configService.saveWebhookConfig(webhookConfig);
			this.notificationService.showSnackbar('Webhook configuration saved successfully');

			// Update initial values after successful save
			this.initialWebhookFormValue = this.webhookForm.getRawValue();
			this.hasWebhookChanges.set(false);
		} catch (error) {
			console.error('Error saving webhook configuration:', error);
			this.notificationService.showSnackbar('Failed to save webhook configuration');
		}
	}

	async testWebhook() {
		const url = this.webhookForm.get('url')?.value;
		if (url) {
			try {
				await this.configService.testWebhookUrl(url);
				this.notificationService.showSnackbar('Test webhook sent successfully. Your URL is reachable.');
			} catch (error: any) {
				const errorMessage = error.error?.message || error.message || 'Unknown error';
				this.notificationService.showSnackbar(`Failed to send test webhook. ${errorMessage}`);
				console.error(`Error sending test webhook. ${errorMessage}`);
			}
		}
	}
}
