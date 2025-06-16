import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

interface ApiKeyData {
	key: string;
	lastGenerated: Date | null;
	isActive: boolean;
}

interface WebhookConfig {
	url: string;
	isEnabled: boolean;
	events: {
		roomCreated: boolean;
		roomDeleted: boolean;
		participantJoined: boolean;
		participantLeft: boolean;
		recordingStarted: boolean;
		recordingFinished: boolean;
	};
}

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
	private fb = inject(FormBuilder);
	private snackBar = inject(MatSnackBar);

	// API Key section
	apiKeyData = signal<ApiKeyData>({
		key: '',
		lastGenerated: null,
		isActive: false
	});

	showApiKey = signal(false);

	// Webhook section
	webhookForm: FormGroup;

	constructor() {
		this.webhookForm = this.fb.group({
			url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
			isEnabled: [false],
			roomCreated: [true],
			roomDeleted: [true],
			participantJoined: [false],
			participantLeft: [false],
			recordingStarted: [true],
			recordingFinished: [true]
		});

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

	ngOnInit() {
		this.loadApiKeyData();
		this.loadWebhookConfig();
	}

	// API Key methods
	generateApiKey() {
		const newKey = this.generateRandomKey();
		this.apiKeyData.set({
			key: newKey,
			lastGenerated: new Date(),
			isActive: true
		});
		this.saveApiKeyData();
		this.snackBar.open('API Key generated successfully', 'Close', {
			duration: 3000,
			horizontalPosition: 'right',
			verticalPosition: 'top'
		});
	}

	regenerateApiKey() {
		this.generateApiKey();
		this.snackBar.open('API Key regenerated successfully', 'Close', {
			duration: 3000,
			horizontalPosition: 'right',
			verticalPosition: 'top'
		});
	}

	toggleApiKeyVisibility() {
		this.showApiKey.set(!this.showApiKey());
	}

	copyApiKey() {
		const apiKey = this.apiKeyData().key;
		if (apiKey) {
			navigator.clipboard.writeText(apiKey).then(() => {
				this.snackBar.open('API Key copied to clipboard', 'Close', {
					duration: 2000,
					horizontalPosition: 'right',
					verticalPosition: 'top'
				});
			});
		}
	}

	revokeApiKey() {
		this.apiKeyData.set({
			key: '',
			lastGenerated: null,
			isActive: false
		});
		this.saveApiKeyData();
		this.snackBar.open('API Key revoked successfully', 'Close', {
			duration: 3000,
			horizontalPosition: 'right',
			verticalPosition: 'top'
		});
	}

	// Webhook methods
	saveWebhookConfig() {
		if (this.webhookForm.valid) {
			const formValue = this.webhookForm.value;
			const webhookConfig: WebhookConfig = {
				url: formValue.url,
				isEnabled: formValue.isEnabled,
				events: {
					roomCreated: formValue.roomCreated,
					roomDeleted: formValue.roomDeleted,
					participantJoined: formValue.participantJoined,
					participantLeft: formValue.participantLeft,
					recordingStarted: formValue.recordingStarted,
					recordingFinished: formValue.recordingFinished
				}
			};

			localStorage.setItem('ov-meet-webhook-config', JSON.stringify(webhookConfig));
			this.snackBar.open('Webhook configuration saved', 'Close', {
				duration: 3000,
				horizontalPosition: 'right',
				verticalPosition: 'top'
			});
		}
	}

	testWebhook() {
		const url = this.webhookForm.get('url')?.value;
		if (url) {
			// Mock test - in real implementation this would send a test webhook
			this.snackBar.open('Test webhook sent successfully', 'Close', {
				duration: 3000,
				horizontalPosition: 'right',
				verticalPosition: 'top'
			});
		}
	}

	// Private methods
	private generateRandomKey(): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = 'ovmeet_';
		for (let i = 0; i < 32; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
	}

	private loadApiKeyData() {
		const saved = localStorage.getItem('ov-meet-api-key');
		if (saved) {
			const parsed = JSON.parse(saved);
			this.apiKeyData.set({
				...parsed,
				lastGenerated: parsed.lastGenerated ? new Date(parsed.lastGenerated) : null
			});
		}
	}

	private saveApiKeyData() {
		localStorage.setItem('ov-meet-api-key', JSON.stringify(this.apiKeyData()));
	}

	private loadWebhookConfig() {
		const saved = localStorage.getItem('ov-meet-webhook-config');
		if (saved) {
			const parsed: WebhookConfig = JSON.parse(saved);
			this.webhookForm.patchValue({
				url: parsed.url,
				isEnabled: parsed.isEnabled,
				roomCreated: parsed.events.roomCreated,
				roomDeleted: parsed.events.roomDeleted,
				participantJoined: parsed.events.participantJoined,
				participantLeft: parsed.events.participantLeft,
				recordingStarted: parsed.events.recordingStarted,
				recordingFinished: parsed.events.recordingFinished
			});
		}
	}
}
