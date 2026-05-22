import { ChangeDetectionStrategy, Component, computed, effect, input, OnDestroy, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ParticipantModel } from '../../models/participant.model';
import { ConnectionQuality } from '../../services/livekit-adapter';

@Component({
	selector: 'ov-connection-quality-indicator',
	standalone: true,
	imports: [MatIconModule],
	templateUrl: './connection-quality-indicator.component.html',
	styleUrl: './connection-quality-indicator.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConnectionQualityIndicatorComponent implements OnDestroy {
	readonly participant = input.required<ParticipantModel>();
	readonly connectionQuality = computed(() => this.participant().connectionQuality);
	readonly participantKey = computed(() => this.participant().sid);

	readonly showBadge = computed(() => {
		return this.connectionQuality() !== ConnectionQuality.Unknown && this.isVisible();
	});

	readonly icon = computed(() => {
		switch (this.connectionQuality()) {
			case ConnectionQuality.Excellent:
				return 'signal_wifi_4_bar';
			case ConnectionQuality.Good:
				return 'network_wifi_3_bar';
			case ConnectionQuality.Poor:
				return 'network_wifi_2_bar';
			default:
				return 'signal_wifi_off';
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

		const previousQuality = this.previousConnectionQuality;
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
			if (previousQuality !== undefined) {
				this.isVisible.set(true);
				this.clearVisibilityTimeout();
				this.visibilityTimeout = setTimeout(() => {
					this.isVisible.set(false);
				}, this.BADGE_TIMEOUT);
				return;
			}
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
}
