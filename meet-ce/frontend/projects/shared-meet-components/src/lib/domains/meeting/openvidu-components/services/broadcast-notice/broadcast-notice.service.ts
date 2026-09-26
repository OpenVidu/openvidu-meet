import { effect, inject, Service } from '@angular/core';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { BroadcastStateService } from '../broadcast/broadcast-state.service';

/** Long enough to be read, short enough not to sit on top of the meeting. */
const NOTICE_DURATION_MS = 10_000;

const ANNOUNCEMENTS = {
	started: {
		icon: 'sensors',
		tone: 'alert' as const,
		title: { key: 'ROOM.BROADCAST_STARTED_TITLE' },
		message: { key: 'ROOM.BROADCAST_STARTED_MESSAGE' }
	},
	stopped: {
		icon: 'sensors',
		tone: 'neutral' as const,
		title: { key: 'ROOM.BROADCAST_STOPPED_TITLE' },
		message: { key: 'ROOM.BROADCAST_STOPPED_MESSAGE' }
	}
};

/**
 * Announces to every participant that the meeting went live, and that it is no longer streamed.
 *
 * Driven off the broadcast state rather than off the button that was pressed, so it reaches every
 * client: the moderator who went live, and anyone who joins while the meeting is already live, for
 * whom the state arriving from the server is that client's first transition into it.
 */
@Service()
export class BroadcastNoticeService {
	private readonly broadcastState = inject(BroadcastStateService);
	private readonly notificationService = inject(NotificationService);

	private wasLive = false;
	private shownId: number | undefined;

	private readonly announceEffect = effect(() => {
		// Ending is still streaming, and a start that never made it does not count as one.
		const isLive = this.broadcastState.isLive() || this.broadcastState.broadcast()?.status === 'ending';

		if (isLive === this.wasLive) return;

		this.wasLive = isLive;
		this.announce(isLive ? 'started' : 'stopped');
	});

	private announce(announcement: keyof typeof ANNOUNCEMENTS): void {
		if (this.shownId !== undefined) {
			this.notificationService.dismissNotification(this.shownId);
		}

		this.shownId = this.notificationService.showNotification({
			kind: `broadcast-${announcement}`,
			placement: 'pinned',
			durationMs: NOTICE_DURATION_MS,
			...ANNOUNCEMENTS[announcement]
		});
	}
}
