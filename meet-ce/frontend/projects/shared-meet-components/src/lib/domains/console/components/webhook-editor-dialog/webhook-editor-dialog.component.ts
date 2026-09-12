import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
	MAT_DIALOG_DATA,
	MatDialogActions,
	MatDialogContent,
	MatDialogRef,
	MatDialogTitle
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MeetWebhook, MeetWebhookEventType, MeetWebhookOptions } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { WebhookService } from '../../../../shared/services/webhook.service';

/** The webhook being edited, or nothing when a new one is being registered. */
export interface WebhookEditorDialogData {
	webhook?: MeetWebhook;
}

@Component({
	selector: 'ov-webhook-editor-dialog',
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatButtonToggleModule,
		MatCheckboxModule,
		MatFormFieldModule,
		MatIconModule,
		MatInputModule,
		MatSlideToggleModule,
		MatDialogTitle,
		MatDialogContent,
		MatDialogActions,
		TranslatePipe
	],
	templateUrl: './webhook-editor-dialog.component.html',
	styleUrl: './webhook-editor-dialog.component.scss'
})
export class WebhookEditorDialogComponent {
	private readonly data = inject<WebhookEditorDialogData>(MAT_DIALOG_DATA);
	private readonly dialogRef = inject(MatDialogRef<WebhookEditorDialogComponent, boolean>);
	private readonly webhookService = inject(WebhookService);
	private readonly notificationService = inject(NotificationService);
	private readonly translateService = inject(TranslateService);

	/** Event types offered by the filter selector, in the order the contract declares them */
	readonly webhookEventTypes = Object.values(MeetWebhookEventType);

	readonly isNewWebhook = !this.data.webhook;

	saving = signal(false);

	webhookForm = new FormGroup({
		url: new FormControl(this.data.webhook?.url ?? '', {
			nonNullable: true,
			validators: [Validators.required, Validators.pattern(/^https?:\/\/.+/)]
		}),
		eventsMode: new FormControl<'all' | 'selected'>(this.data.webhook?.events?.length ? 'selected' : 'all', {
			nonNullable: true
		}),
		events: new FormControl<MeetWebhookEventType[]>(this.data.webhook?.events ?? [], { nonNullable: true }),
		roomScope: new FormControl<'all' | 'one'>(this.data.webhook?.roomId ? 'one' : 'all', { nonNullable: true }),
		roomId: new FormControl(this.data.webhook?.roomId ?? '', { nonNullable: true }),
		enabled: new FormControl(this.data.webhook?.enabled ?? true, { nonNullable: true })
	});

	/**
	 * A webhook is only saveable once every choice the editor asks for has an answer: a valid URL, at
	 * least one event type when the filter is narrowed, and a room id when the scope is narrowed.
	 */
	get canSave(): boolean {
		if (this.webhookForm.invalid || this.saving()) return false;

		const { eventsMode, events, roomScope, roomId } = this.webhookForm.getRawValue();

		if (eventsMode === 'selected' && events.length === 0) return false;

		return roomScope !== 'one' || !!roomId.trim();
	}

	isEventTypeSelected(eventType: MeetWebhookEventType): boolean {
		return this.webhookForm.controls.events.value.includes(eventType);
	}

	toggleEventType(eventType: MeetWebhookEventType, selected: boolean) {
		const events = this.webhookForm.controls.events.value;
		this.webhookForm.controls.events.setValue(
			selected ? [...events, eventType] : events.filter((type) => type !== eventType)
		);
	}

	cancel() {
		this.dialogRef.close(false);
	}

	/** Saves the webhook, keeping the dialog open when the request fails so nothing typed is lost. */
	async save() {
		if (!this.canSave) return;

		const { url, eventsMode, events, roomScope, roomId, enabled } = this.webhookForm.getRawValue();
		const options: MeetWebhookOptions = {
			url,
			events: eventsMode === 'selected' ? events : undefined,
			roomId: roomScope === 'one' ? roomId.trim() || undefined : undefined,
			enabled
		};

		this.saving.set(true);

		try {
			if (this.data.webhook) {
				await this.webhookService.updateWebhook(this.data.webhook.webhookId, options);
			} else {
				await this.webhookService.createWebhook(options);
			}

			this.notificationService.showSnackbar(this.translateService.translate('EMBEDDED.ERRORS.WEBHOOK_SAVED'));
			this.dialogRef.close(true);
		} catch (error: any) {
			const errorMessage = error.error?.message || error.message || '';
			this.notificationService.showSnackbar(
				`${this.translateService.translate('EMBEDDED.ERRORS.WEBHOOK_SAVE_FAILED')} ${errorMessage}`.trim()
			);
		} finally {
			this.saving.set(false);
		}
	}
}
