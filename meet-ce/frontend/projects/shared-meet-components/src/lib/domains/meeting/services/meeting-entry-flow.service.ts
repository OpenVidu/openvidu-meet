import { inject, Injectable, signal } from '@angular/core';
import { DialogService } from '../../../shared/services/dialog.service';
import { TranslateService } from '../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { RoomService } from '../../rooms/services/room.service';
import {
	DEFAULT_MEETING_ENTRY_OPTIONS,
	joinScreenNeeded,
	MeetingEntryOptions
} from '../utils/meeting-entry-flow.utils';
import { MeetingContextService } from './meeting-context.service';
import { MeetingJoinService } from './meeting-join.service';
import { WaitingRoomService } from '../waiting-room/waiting-room.service';

/**
 * Where the participant is on their way into the meeting:
 * - `preparing`: the room loads.
 * - `join`: the join screen.
 * - `meeting`: the meeting view, which runs the device setup screen, the connection and the meeting itself.
 * - `left`: the participant left; the end screen is a route of its own.
 * - `error`: the meeting could not be prepared.
 */
export type MeetingEntryStep = 'preparing' | 'join' | 'meeting' | 'left' | 'error';

/** Owns the way into the meeting. Provided by `MeetingComponent`, so each meeting starts from `preparing`. */
@Injectable()
export class MeetingEntryFlowService {
	private readonly joinService = inject(MeetingJoinService);
	private readonly waitingRoom = inject(WaitingRoomService);
	private readonly roomService = inject(RoomService);
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly dialogService = inject(DialogService);
	private readonly translateService = inject(TranslateService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - MeetingEntryFlowService');

	private readonly _step = signal<MeetingEntryStep>('preparing');
	private readonly _options = signal<MeetingEntryOptions>(DEFAULT_MEETING_ENTRY_OPTIONS);

	readonly step = this._step.asReadonly();
	readonly options = this._options.asReadonly();

	async start(): Promise<void> {
		this._step.set('preparing');

		try {
			await this.joinService.initialize();
		} catch (error) {
			this.log.e('Error preparing the meeting:', error);
			this._step.set('error');
			this.dialogService.showDialog({
				title: this.translateService.translate('MEETING_PAGE.INIT_ERROR_TITLE'),
				message: this.translateService.translate('MEETING_PAGE.INIT_ERROR_MESSAGE'),
				showCancelButton: false,
				confirmText: this.translateService.translate('MEETING_PAGE.INIT_ERROR_CONFIRM')
			});
			return;
		}

		const resumingWait = this.joinService.asksToJoin() && this.waitingRoom.hasPendingWait();

		if (joinScreenNeeded(this._options(), this.joinService.joinScreenState(), resumingWait)) {
			this._step.set('join');
		} else {
			await this.enterMeeting();
		}
	}

	/** The join screen's submit. */
	async completeJoinScreen(): Promise<void> {
		if (this._step() !== 'join' || !this.joinService.submit()) return;

		await this.enterMeeting();
	}

	left(): void {
		this._step.set('left');
	}

	/**
	 * The room config carries the room's initial media state, which the device setup screen opens the
	 * devices with, so it loads before the meeting view mounts. A failure must not block the join.
	 */
	private async enterMeeting(): Promise<void> {
		await this.roomService.loadRoomConfig(this.meetingContextService.roomId()!).catch((error) => {
			this.log.w('Could not load the room config before joining; its initial media state will not apply', error);
		});
		this._step.set('meeting');
	}
}
