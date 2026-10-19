import { inject, Injectable, signal } from '@angular/core';
import { EmbeddedEventName, MeetBroadcastDestination, MeetBroadcastInfo, MeetRoomConfig } from '@openvidu-meet/typings';
import { EventLogService } from './event-log';

/** Read through the same-origin `/api/v1/rooms` proxy, which attaches the API key (see `proxy.conf.js`). */
const roomConfigEndpoint = (roomId: string) => `/api/v1/rooms/${encodeURIComponent(roomId)}/config`;

const broadcastOf = (payload: unknown): MeetBroadcastInfo | null => {
	const broadcast = payload as MeetBroadcastInfo | null;
	return broadcast?.broadcastId ? broadcast : null;
};

/**
 * What the broadcast commands can target: the destinations saved in the joined room's config, read
 * when the meeting is joined, and the broadcasts of the meeting, folded from the broadcast events.
 * The embedded API replays the running broadcasts to a participant joining, so none is missed.
 */
@Injectable({ providedIn: 'root' })
export class BroadcastRosterService {
	private readonly log = inject(EventLogService);

	private readonly _destinations = signal<MeetBroadcastDestination[]>([]);
	private readonly _broadcasts = signal<MeetBroadcastInfo[]>([]);

	/** The room's saved destinations, each with its `id`. */
	readonly destinations = this._destinations.asReadonly();
	/** The broadcasts seen starting and not yet seen ending, in start order. */
	readonly broadcasts = this._broadcasts.asReadonly();

	track(name: string, payload: unknown): void {
		switch (name) {
			case EmbeddedEventName.MEETING_JOINED:
				void this.loadDestinations((payload as { roomId: string }).roomId);
				break;

			case EmbeddedEventName.BROADCAST_STARTED:
			case EmbeddedEventName.BROADCAST_UPDATED:
				this.upsert(broadcastOf(payload));
				break;

			case EmbeddedEventName.BROADCAST_ENDED:
				this.remove(broadcastOf(payload));
				break;

			case EmbeddedEventName.MEETING_LEFT:
			case EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED:
				this.clear();
				break;
		}
	}

	clear(): void {
		this._destinations.set([]);
		this._broadcasts.set([]);
	}

	private async loadDestinations(roomId: string): Promise<void> {
		try {
			const response = await fetch(roomConfigEndpoint(roomId));

			if (!response.ok) throw new Error(`the Meet API answered ${response.status}`);

			const config = (await response.json()) as MeetRoomConfig;
			this._destinations.set(config.broadcast?.destinations ?? []);
		} catch (error) {
			this._destinations.set([]);
			this.log.warning('Room destinations', error instanceof Error ? error.message : 'unknown error');
		}
	}

	private upsert(broadcast: MeetBroadcastInfo | null): void {
		if (!broadcast) return;

		this._broadcasts.update((broadcasts) =>
			broadcasts.some(({ broadcastId }) => broadcastId === broadcast.broadcastId)
				? broadcasts.map((current) => (current.broadcastId === broadcast.broadcastId ? broadcast : current))
				: [...broadcasts, broadcast]
		);
	}

	private remove(broadcast: MeetBroadcastInfo | null): void {
		if (!broadcast) return;

		this._broadcasts.update((broadcasts) =>
			broadcasts.filter(({ broadcastId }) => broadcastId !== broadcast.broadcastId)
		);
	}
}
