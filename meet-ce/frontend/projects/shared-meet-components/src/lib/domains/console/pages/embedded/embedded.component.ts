import { Clipboard } from '@angular/cdk/clipboard';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetApiKey, MeetWebhook } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ApiKeyService } from '../../../../shared/services/api-key.service';
import { DialogPresetsService } from '../../../../shared/services/dialog-presets.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { DialogService } from '../../../../shared/services/dialog.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { WebhookService } from '../../../../shared/services/webhook.service';
import { WebhookEditorDialogComponent } from '../../components/webhook-editor-dialog/webhook-editor-dialog.component';

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
	protected dialogService = inject(DialogService);
	protected dialogPresetsService = inject(DialogPresetsService);
	protected clipboard = inject(Clipboard);
	private readonly dialog = inject(MatDialog);
	private readonly translateService = inject(TranslateService);

	restApiDocsUrl = signal<string>('');

	isLoading = signal(true);

	apiKeyData = signal<MeetApiKey | undefined>(undefined);
	showApiKey = signal(false);

	webhooks = signal<MeetWebhook[]>([]);

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

	/** Number of registered webhooks currently delivering events */
	get activeWebhookCount(): number {
		return this.webhooks().filter((webhook) => webhook.enabled).length;
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

	/** Opens the editor dialog; `webhook` is omitted when registering a new one. */
	openWebhookEditor(webhook?: MeetWebhook) {
		this.dialog
			.open(WebhookEditorDialogComponent, {
				width: '620px',
				data: { webhook },
				panelClass: 'ov-meet-dialog'
			})
			.afterClosed()
			.subscribe(async (saved) => {
				if (saved) await this.loadWebhooks();
			});
	}

	copyWebhookUrl(webhook: MeetWebhook) {
		this.clipboard.copy(webhook.url);
		this.notificationService.showSnackbar(this.translateService.translate('EMBEDDED.ERRORS.WEBHOOK_URL_COPIED'));
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
		this.dialogService.showDialog({
			...this.dialogPresetsService.getDeleteWebhookDialogPreset(webhook.url),
			confirmCallback: async () => {
				try {
					await this.webhookService.deleteWebhook(webhook.webhookId);
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
