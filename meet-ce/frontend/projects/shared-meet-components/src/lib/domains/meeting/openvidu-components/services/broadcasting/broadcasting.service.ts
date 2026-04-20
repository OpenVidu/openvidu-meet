import { Injectable, signal } from '@angular/core';
import { BroadcastingStatus, BroadcastingStatusInfo } from '../../models/broadcasting.model';

@Injectable({
	providedIn: 'root'
})
export class BroadcastingService {
	/**
	 * Broadcasting status signal which emits the {@link BroadcastingStatusInfo} in every update.
	 */
	readonly broadcastingStatus = signal<BroadcastingStatusInfo>({
		status: BroadcastingStatus.STOPPED,
		broadcastingId: undefined,
		error: undefined
	});

	/**
	 * @internal
	 */
	constructor() {}

	/**
	 * @internal
	 */
	setBroadcastingStarted(broadcastingId: string) {
		const statusInfo: BroadcastingStatusInfo = {
			status: BroadcastingStatus.STARTED,
			broadcastingId,
			error: undefined
		};

		this.updateStatus(statusInfo);
	}

	/**
	 * @internal
	 */
	setBroadcastingStopped() {
		const statusInfo: BroadcastingStatusInfo = {
			status: BroadcastingStatus.STOPPED,
			broadcastingId: undefined
		};
		this.updateStatus(statusInfo);
	}

	/**
	 * @internal
	 * @param error
	 */
	setBroadcastingFailed(error: string) {
		const statusInfo: BroadcastingStatusInfo = {
			status: BroadcastingStatus.FAILED,
			broadcastingId: undefined,
			error
		};
		this.updateStatus(statusInfo);
	}

	/**
	 * Set the broadcasting {@link BroadcastingStatus} to **starting**.
	 * The `started` status will be updated automatically when the broadcasting is started.
	 */
	setBroadcastingStarting() {
		const statusInfo: BroadcastingStatusInfo = {
			status: BroadcastingStatus.STARTING,
			broadcastingId: undefined,
			error: undefined
		};
		this.updateStatus(statusInfo);
	}

	/**
	 * Set the broadcasting {@link BroadcastingStatus} to **stopping**.
	 * The `stopped` status will be updated automatically when the broadcasting is stopped.
	 */
	setBroadcastingStopping() {
		const statusInfo: BroadcastingStatusInfo = {
			status: BroadcastingStatus.STOPPING,
			broadcastingId: this.broadcastingStatus().broadcastingId
		};
		this.updateStatus(statusInfo);
	}

	/**
	 * Update the broadcasting status.
	 * @param status {@link BroadcastingStatusInfo}
	 * @intenal
	 */
	private updateStatus(statusInfo: BroadcastingStatusInfo) {
		const { status, broadcastingId, error } = statusInfo;
		this.broadcastingStatus.set({
			status,
			broadcastingId,
			error
		});
	}
}
