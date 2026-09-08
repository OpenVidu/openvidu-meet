import { inject, Injectable, signal } from '@angular/core';
import { MeetRoom, MeetRoomStatus, SortOrder } from '@openvidu-meet/typings';
import { EventLogService } from './event-log';

/** Anonymous access role whose URL can mount the embedded app. */
export type AccessRole = 'moderator' | 'speaker';

/** A room as the browser lists it, with the access URLs it can hand to the Setup form. */
export interface RoomChoice {
	readonly roomId: string;
	readonly roomName: string;
	readonly status: MeetRoomStatus;
	/** Access URL per role, or `null` when anonymous access is disabled for it. */
	readonly urls: Readonly<Record<AccessRole, string | null>>;
}

/** Rooms are listed newest first; one page is plenty for picking a room by hand. */
const PAGE_SIZE = 50;

/**
 * The list endpoint is reached same-origin at `/api/v1/rooms`, which the dev
 * server proxies to the Meet backend and stamps with the API key (see
 * `proxy.conf.js`). No key ever reaches this bundle.
 */
const ROOMS_ENDPOINT = '/api/v1/rooms';

type RoomsResponse = { rooms: Pick<MeetRoom, 'roomId' | 'roomName' | 'status' | 'access'>[] };

const accessUrl = (room: RoomsResponse['rooms'][number], role: AccessRole): string | null => {
	const access = room.access?.anonymous?.[role];
	return access?.enabled && access.url ? access.url : null;
};

/**
 * Reads the Meet room list so the Setup form can be filled from a real room
 * instead of a hand-copied URL.
 */
@Injectable({ providedIn: 'root' })
export class MeetApiService {
	private readonly log = inject(EventLogService);

	private readonly _rooms = signal<RoomChoice[]>([]);
	private readonly _loading = signal(false);
	private readonly _error = signal<string | null>(null);

	readonly rooms = this._rooms.asReadonly();
	readonly loading = this._loading.asReadonly();
	/** Why the last load failed, or `null`. */
	readonly error = this._error.asReadonly();

	async loadRooms(): Promise<void> {
		if (this._loading()) return;

		this._loading.set(true);
		this._error.set(null);

		const query = new URLSearchParams({
			maxItems: String(PAGE_SIZE),
			sortField: 'creationDate',
			sortOrder: SortOrder.DESC,
			fields: 'roomId,roomName,status,access'
		});

		try {
			const response = await fetch(`${ROOMS_ENDPOINT}?${query}`);

			if (!response.ok) {
				throw new Error(`the Meet API answered ${response.status}`);
			}

			// `proxy.conf.js` is read once, when the dev server starts. A server started
			// before this route existed answers the SPA fallback instead of forwarding.
			if (!response.headers.get('content-type')?.includes('application/json')) {
				throw new Error('the dev server is not proxying this route, restart ng serve to pick up proxy.conf.js');
			}

			const { rooms } = (await response.json()) as RoomsResponse;

			this._rooms.set(
				rooms.map((room) => ({
					roomId: room.roomId,
					roomName: room.roomName,
					status: room.status,
					urls: { moderator: accessUrl(room, 'moderator'), speaker: accessUrl(room, 'speaker') }
				}))
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown error';
			this._rooms.set([]);
			this._error.set(reason);
			this.log.warning('Room list', reason);
		} finally {
			this._loading.set(false);
		}
	}
}
