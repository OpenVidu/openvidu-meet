import { Clipboard } from '@angular/cdk/clipboard';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetApiKey, MeetWebhook, MeetWebhookEventType, MeetWebhookOptions } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ApiKeyService } from '../../../../shared/services/api-key.service';
import { DialogPresetsService } from '../../../../shared/services/dialog-presets.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { WebhookService } from '../../../../shared/services/webhook.service';

@Component({
	selector: 'ov-embedded',
	imports: [
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatChipsModule,
		MatSelectModule,
		MatSlideToggleModule,
		MatTooltipModule,
		ReactiveFormsModule,
		MatProgressSpinnerModule,
		TranslatePipe
	],
	templateUrl: './embedded.component.html',
	styleUrl: './embedded.component.scss'
})
export class EmbeddedComponent implements OnInit {
	private runtimeConfigService = inject(RuntimeConfigService);
	protected apiKeyService = inject(ApiKeyService);
	protected webhookService = inject(WebhookService);
	protected notificationService = inject(NotificationService);
	protected dialogPresetsService = inject(DialogPresetsService);
	protected clipboard = inject(Clipboard);
	private readonly translateService = inject(TranslateService);

	restApiDocsUrl = signal<string>('');

	isLoading = signal(true);

	apiKeyData = signal<MeetApiKey | undefined>(undefined);
	showApiKey = signal(false);

	webhooks = signal<MeetWebhook[]>([]);
	/** `null` = editor closed; `'new'` = creating; otherwise the id of the webhook being edited */
	editingWebhookId = signal<string | 'new' | null>(null);
	savingWebhook = signal(false);

	/** Event types offered by the filter selector, in the order the contract declares them */
	readonly webhookEventTypes = Object.values(MeetWebhookEventType);

	webhookForm = new FormGroup({
		url: new FormControl('', {
			nonNullable: true,
			validators: [Validators.required, Validators.pattern(/^https?:\/\/.+/)]
		}),
		// An empty selection means "every event type"
		events: new FormControl<MeetWebhookEventType[]>([], { nonNullable: true }),
		roomId: new FormControl('', { nonNullable: true }),
		enabled: new FormControl(true, { nonNullable: true })
	});

	async ngOnInit() {
		// Build the REST API documentation URL with the deployment base path
		const docsPath = '/api/v1/docs/';
		this.restApiDocsUrl.set(this.runtimeConfigService.resolveUrl(docsPath));

		this.isLoading.set(true);
		await Promise.all([this.loadApiKeyData(), this.loadWebhooks()]);
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
			this.notificationService.showSnackbar(this.translateService.translate('EMBEDDED.ERRORS.LOAD_API_FAILED'));
			this.apiKeyData.set(undefined);
		}
	}

	async generateApiKey() {
		try {
			const newApiKey = await this.apiKeyService.generateApiKey();
			this.apiKeyData.set(newApiKey);
			this.showApiKey.set(true);
			this.notificationService.showSnackbar(this.translateService.translate('EMBEDDED.ERRORS.API_GENERATED'));
		} catch (error) {
			console.error('Error generating API key:', error);
			this.notificationService.showSnackbar(
				this.translateService.translate('EMBEDDED.ERRORS.API_GENERATE_FAILED')
			);
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
			this.notificationService.showSnackbar(this.translateService.translate('EMBEDDED.ERRORS.API_COPIED'));
		}
	}

	async revokeApiKey() {
		try {
			await this.apiKeyService.deleteApiKeys();
			this.apiKeyData.set(undefined);
			this.showApiKey.set(false);
			this.notificationService.showSnackbar(this.translateService.translate('EMBEDDED.ERRORS.API_REVOKED'));
		} catch (error) {
			console.error('Error revoking API key:', error);
			this.notificationService.showSnackbar(this.translateService.translate('EMBEDDED.ERRORS.API_REVOKE_FAILED'));
		}
	}

	// ===== WEBHOOK METHODS =====

	/**
	 * Webhook deliveries are signed with the deployment's API key, so managing webhooks without
	 * one would only register endpoints whose deliveries fail.
	 */
	get canManageWebhooks(): boolean {
		return !!this.apiKeyData();
	}

	private async loadWebhooks() {
		try {
			this.webhooks.set(await this.webhookService.getWebhooks());
		} catch (error) {
			console.error('Error loading webhooks:', error);
			this.notificationService.showSnackbar(
				this.translateService.translate('EMBEDDED.ERRORS.LOAD_WEBHOOKS_FAILED')
			);
		}
	}

	openWebhookCreator() {
		this.webhookForm.reset();
		this.editingWebhookId.set('new');
	}

	openWebhookEditor(webhook: MeetWebhook) {
		this.webhookForm.reset({
			url: webhook.url,
			events: webhook.events ?? [],
			roomId: webhook.roomId ?? '',
			enabled: webhook.enabled
		});
		this.editingWebhookId.set(webhook.webhookId);
	}

	closeWebhookEditor() {
		this.editingWebhookId.set(null);
		this.webhookForm.reset();
	}

	async saveWebhook() {
		if (this.webhookForm.invalid || this.savingWebhook()) return;

		const { url, events, roomId, enabled } = this.webhookForm.getRawValue();
		const options: MeetWebhookOptions = {
			url,
			events: events.length > 0 ? events : undefined,
			roomId: roomId.trim() || undefined,
			enabled
		};
		const editingId = this.editingWebhookId();

		this.savingWebhook.set(true);

		try {
			if (editingId === 'new') {
				await this.webhookService.createWebhook(options);
			} else if (editingId) {
				await this.webhookService.updateWebhook(editingId, options);
			}

			this.notificationService.showSnackbar(this.translateService.translate('EMBEDDED.ERRORS.WEBHOOK_SAVED'));
			this.closeWebhookEditor();
			await this.loadWebhooks();
		} catch (error: any) {
			console.error('Error saving webhook:', error);
			const errorMessage = error.error?.message || error.message || '';
			this.notificationService.showSnackbar(
				`${this.translateService.translate('EMBEDDED.ERRORS.WEBHOOK_SAVE_FAILED')} ${errorMessage}`.trim()
			);
		} finally {
			this.savingWebhook.set(false);
		}
	}

	async toggleWebhookEnabled(webhook: MeetWebhook, enabled: boolean) {
		try {
			await this.webhookService.updateWebhook(webhook.webhookId, {
				url: webhook.url,
				events: webhook.events,
				roomId: webhook.roomId,
				enabled
			});
			await this.loadWebhooks();
		} catch (error) {
			console.error('Error updating webhook:', error);
			this.notificationService.showSnackbar(
				this.translateService.translate('EMBEDDED.ERRORS.WEBHOOK_SAVE_FAILED')
			);
			await this.loadWebhooks();
		}
	}

	deleteWebhook(webhook: MeetWebhook) {
		this.notificationService.showDialog({
			...this.dialogPresetsService.getDeleteWebhookDialogPreset(webhook.url),
			confirmCallback: async () => {
				try {
					await this.webhookService.deleteWebhook(webhook.webhookId);

					if (this.editingWebhookId() === webhook.webhookId) {
						this.closeWebhookEditor();
					}

					this.notificationService.showSnackbar(
						this.translateService.translate('EMBEDDED.ERRORS.WEBHOOK_DELETED')
					);
				} catch (error) {
					console.error('Error deleting webhook:', error);
					this.notificationService.showSnackbar(
						this.translateService.translate('EMBEDDED.ERRORS.WEBHOOK_DELETE_FAILED')
					);
				}

				await this.loadWebhooks();
			}
		});
	}

	async testWebhook(webhook: MeetWebhook) {
		try {
			await this.webhookService.testWebhook(webhook.webhookId);
			this.notificationService.showSnackbar(this.translateService.translate('EMBEDDED.ERRORS.TEST_SENT'));
		} catch (error: any) {
			const errorMessage = error.error?.message || error.message || 'Unknown error';
			this.notificationService.showSnackbar(
				`${this.translateService.translate('EMBEDDED.ERRORS.TEST_FAILED')} ${errorMessage}`
			);
			console.error(`Error sending test webhook. ${errorMessage}`);
		}
	}
}
