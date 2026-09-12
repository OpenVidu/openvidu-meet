import { Component, computed, effect, inject, input, OnDestroy, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParticipantModel } from '../../models/participant.model';
import { ConnectionQuality } from '../../services/livekit';
import { MeetingTranslateService } from '../../services/translate/meeting-translate.service';

@Component({
	selector: 'ov-connection-quality-indicator',
	imports: [MatIconModule, MatTooltipModule],
	templateUrl: './connection-quality-indicator.component.html',
	styleUrl: './connection-quality-indicator.component.scss'
})
export class ConnectionQualityIndicatorComponent implements OnDestroy {
	readonly participant = input.required<ParticipantModel>();

	/**
	 * `tile` floats the badge over a video tile. `badge` pins it to the corner of a participant
	 * avatar and shows it only while the connection is actually in trouble — a healthy connection on
	 * every row is noise.
	 */
	readonly variant = input<'tile' | 'badge'>('tile');
	readonly connectionQuality = computed(() => this.participant().connectionQuality);
	readonly participantKey = computed(() => this.participant().sid);
	private readonly translateService = inject(MeetingTranslateService);

	readonly isTroubled = computed(
		() => this.connectionQuality() === ConnectionQuality.Poor || this.connectionQuality() === ConnectionQuality.Lost
	);

	readonly showBadge = computed(() => {
		if (this.variant() === 'badge') return this.isTroubled();

		return this.connectionQuality() !== ConnectionQuality.Unknown && this.isVisible();
	});

	readonly tooltipText = computed(() => {
		const label = this.translateService.translate('PANEL.PARTICIPANTS.CONNECTION_QUALITY.LABEL');
		const qualityKey = this.qualityTranslationKey(this.connectionQuality());
		const value = this.translateService.translate(`PANEL.PARTICIPANTS.CONNECTION_QUALITY.${qualityKey}`);
		return `${label}: ${value}`;
	});

	readonly icon = computed(() => {
		switch (this.connectionQuality()) {
			case ConnectionQuality.Excellent:
				return 'signal_wifi_4_bar';
			case ConnectionQuality.Good:
				return 'network_wifi_3_bar';
			case ConnectionQuality.Poor:
				return this.variant() === 'badge' ? 'signal_wifi_bad' : 'network_wifi_2_bar';
			default:
				return this.variant() === 'badge' ? 'wifi_off' : 'signal_wifi_off';
		}
	});

	private readonly BADGE_TIMEOUT = 3000;
	private readonly isVisible = signal(false);
	private visibilityTimeout: ReturnType<typeof setTimeout> | undefined;
	private previousConnectionQuality: ConnectionQuality | undefined;
	private previousParticipantKey: string | undefined;

	private readonly visibilityEffect = effect(() => {
		const participantKey = this.participantKey();
		const quality = this.connectionQuality();

		if (participantKey !== this.previousParticipantKey) {
			this.previousParticipantKey = participantKey;
			this.previousConnectionQuality = undefined;
			this.clearVisibilityTimeout();
			this.isVisible.set(false);
		}

		if (quality === this.previousConnectionQuality) {
			return;
		}

		this.previousConnectionQuality = quality;

		if (quality === ConnectionQuality.Unknown) {
			this.clearVisibilityTimeout();
			this.isVisible.set(false);
			return;
		}

		if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) {
			this.clearVisibilityTimeout();
			this.isVisible.set(true);
			return;
		}

		if (quality === ConnectionQuality.Good || quality === ConnectionQuality.Excellent) {
			this.isVisible.set(true);
			this.clearVisibilityTimeout();
			this.visibilityTimeout = setTimeout(() => {
				this.isVisible.set(false);
			}, this.BADGE_TIMEOUT);
			return;
		}

		this.clearVisibilityTimeout();
		this.isVisible.set(false);
	});

	ngOnDestroy() {
		this.clearVisibilityTimeout();
	}

	private clearVisibilityTimeout() {
		if (this.visibilityTimeout) {
			clearTimeout(this.visibilityTimeout);
			this.visibilityTimeout = undefined;
		}
	}

	private qualityTranslationKey(quality: ConnectionQuality): string {
		switch (quality) {
			case ConnectionQuality.Excellent: return 'EXCELLENT';
			case ConnectionQuality.Good: return 'GOOD';
			case ConnectionQuality.Poor: return 'POOR';
			default: return 'LOST';
		}
	}
}
