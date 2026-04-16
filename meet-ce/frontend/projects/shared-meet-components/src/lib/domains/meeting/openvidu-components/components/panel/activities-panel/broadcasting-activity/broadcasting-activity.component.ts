import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, input, OnInit, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
	BroadcastingStartRequestedEvent,
	BroadcastingStatus,
	BroadcastingStatusInfo,
	BroadcastingStopRequestedEvent
} from '../../../../models/broadcasting.model';
import { BroadcastingService } from '../../../../services/broadcasting/broadcasting.service';
import { OpenViduService } from '../../../../services/openvidu/openvidu.service';
import { ParticipantService } from '../../../../services/participant/participant.service';

/**
 * The **BroadcastingActivityComponent** is the component that allows showing the broadcasting activity.
 *
 */
@Component({
	selector: 'ov-broadcasting-activity',
	templateUrl: './broadcasting-activity.component.html',
	styleUrls: ['./broadcasting-activity.component.scss', '../activities-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false
})

// TODO: Allow to add more than one broadcast url
// TODO: allow to choose the layout of the broadcast
export class BroadcastingActivityComponent implements OnInit {
	/**
	 * Provides event notifications that fire when start broadcasting button is clicked.
	 * It provides the {@link BroadcastingStartRequestedEvent} payload as event data.
	 */
	onBroadcastingStartRequested = output<BroadcastingStartRequestedEvent>();

	/**
	 * Provides event notifications that fire when stop broadcasting button is clicked.
	 * It provides the {@link BroadcastingStopRequestedEvent} payload as event data.
	 */
	onBroadcastingStopRequested = output<BroadcastingStopRequestedEvent>();

	/**
	 * @internal
	 */
	urlRequiredError: boolean = false;

	/**
	 * @internal
	 */
	broadcastUrl: string = '';

	/**
	 * @internal
	 */
	expanded = input(false);

	/**
	 * @internal
	 */
	broadcastingError: string | undefined;

	/**
	 * @internal
	 */
	broadcastingStatus: BroadcastingStatus = BroadcastingStatus.STOPPED;
	/**
	 * @internal
	 */
	broadcastingId: string | undefined;
	/**
	 * @internal
	 */
	broadcastingStatusEnum = BroadcastingStatus;
	/**
	 * @internal
	 */
	isPanelOpened: boolean = false;

	private readonly destroyRef = inject(DestroyRef);

	/**
	 * @internal
	 */
	private readonly broadcastingService = inject(BroadcastingService);
	private readonly participantService = inject(ParticipantService);
	private readonly openviduService = inject(OpenViduService);
	private readonly cd = inject(ChangeDetectorRef);

	/**
	 * @internal
	 */
	ngOnInit(): void {
		this.subscribeToBroadcastingStatus();
	}

	/**
	 * @internal
	 */
	setPanelOpened(value: boolean) {
		this.isPanelOpened = value;
	}

	/**
	 * @ignore
	 */
	eventKeyPress(event: KeyboardEvent) {
		// Pressed 'Enter' key
		if (event && event.key === 'Enter') {
			event.preventDefault();
			this.startBroadcasting();
		}
	}

	/**
	 * @internal
	 */
	startBroadcasting() {
		if (!!this.broadcastUrl) {
			const payload: BroadcastingStartRequestedEvent = {
				roomName: this.openviduService.getRoomName(),
				broadcastUrl: this.broadcastUrl
			};
			this.onBroadcastingStartRequested.emit(payload);
		}
		this.urlRequiredError = !this.broadcastUrl;
	}

	/**
	 * @internal
	 */
	stopBroadcasting() {
		const payload: BroadcastingStopRequestedEvent = {
			roomName: this.openviduService.getRoomName(),
			broadcastingId: this.broadcastingId as string
		};
		this.broadcastingService.setBroadcastingStopped();
		this.onBroadcastingStopRequested.emit(payload);
	}

	private subscribeToBroadcastingStatus() {
		this.broadcastingService.broadcastingStatusObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event: BroadcastingStatusInfo | undefined) => {
			if (!!event) {
				const { status, broadcastingId, error } = event;
				this.broadcastingStatus = status;
				this.broadcastingError = error;
				this.broadcastingId = broadcastingId;
				this.cd.markForCheck();
			}
		});
	}
}
