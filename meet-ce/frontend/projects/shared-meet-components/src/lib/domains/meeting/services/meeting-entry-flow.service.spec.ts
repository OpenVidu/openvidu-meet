import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetRoomConfig } from '@openvidu-meet/typings';
import { DialogService } from '../../../shared/services/dialog.service';
import { TranslateService } from '../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { RoomFeatureService } from '../../rooms/services/room-feature.service';
import { DEFAULT_MEETING_ENTRY_OPTIONS, JoinScreenState } from '../utils/meeting-entry-flow.utils';
import { MeetingEntryFlowService } from './meeting-entry-flow.service';
import { WaitingRoomService } from '../waiting-room/waiting-room.service';
import { MeetingJoinService } from './meeting-join.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

describe('MeetingEntryFlowService', () => {
	const ROOM_CONFIG = { chat: { enabled: false } } as MeetRoomConfig;
	const ready: JoinScreenState = { nameKnown: true, e2eeKeyMissing: false, roomClosed: false, canJoinMeeting: true };

	let flow: MeetingEntryFlowService;
	let joinService: jasmine.SpyObj<MeetingJoinService>;
	let setRoomConfig: jasmine.Spy;
	let showDialog: jasmine.Spy;
	let hasPendingWait: jasmine.Spy;
	let asksToJoin: jasmine.Spy;

	beforeEach(() => {
		joinService = jasmine.createSpyObj<MeetingJoinService>('MeetingJoinService', [
			'initialize',
			'submit',
			'joinScreenState'
		]);
		joinService.initialize.and.resolveTo(ROOM_CONFIG);
		joinService.submit.and.returnValue(true);
		joinService.joinScreenState.and.returnValue(ready);
		asksToJoin = jasmine.createSpy('asksToJoin').and.returnValue(true);
		Object.assign(joinService, { asksToJoin });

		setRoomConfig = jasmine.createSpy('setRoomConfig');
		showDialog = jasmine.createSpy('showDialog');
		hasPendingWait = jasmine.createSpy('hasPendingWait').and.returnValue(false);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingEntryFlowService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: MeetingJoinService, useValue: joinService },
				{ provide: RoomFeatureService, useValue: { setRoomConfig } },
				{ provide: WaitingRoomService, useValue: { hasPendingWait } },
				{ provide: DialogService, useValue: { showDialog } },
				{ provide: TranslateService, useValue: { translate: (key: string) => key } }
			]
		});

		flow = TestBed.inject(MeetingEntryFlowService);
	});

	it('prepares the meeting first, with both screens on', () => {
		expect(flow.step()).toBe('preparing');
		expect(flow.options()).toEqual(DEFAULT_MEETING_ENTRY_OPTIONS);
	});

	it('shows the join screen once the room has loaded, with the room config already applied', async () => {
		await flow.start();

		expect(flow.step()).toBe('join');
		expect(setRoomConfig).toHaveBeenCalledOnceWith(ROOM_CONFIG);
	});

	it('goes on to the meeting, without the join screen, to continue a wait a reload interrupted', async () => {
		hasPendingWait.and.returnValue(true);

		await flow.start();

		expect(flow.step()).toBe('meeting');
		expect(setRoomConfig).toHaveBeenCalledOnceWith(ROOM_CONFIG);
	});

	it('shows the join screen when the room no longer makes the participant wait, whatever a reload left behind', async () => {
		hasPendingWait.and.returnValue(true);
		asksToJoin.and.returnValue(false);

		await flow.start();

		expect(flow.step()).toBe('join');
	});

	it('shows the error step and a dialog when the room cannot be loaded', async () => {
		joinService.initialize.and.rejectWith(new Error('Timeout loading room data'));

		await flow.start();

		expect(flow.step()).toBe('error');
		expect(setRoomConfig).not.toHaveBeenCalled();
		expect(showDialog).toHaveBeenCalledOnceWith(
			jasmine.objectContaining({ message: 'MEETING_PAGE.INIT_ERROR_MESSAGE' })
		);
	});

	describe('leaving the join screen', () => {
		beforeEach(async () => {
			await flow.start();
		});

		it('enters the meeting with the config the room loaded with, without reading it again', () => {
			flow.completeJoinScreen();

			expect(flow.step()).toBe('meeting');
			expect(setRoomConfig).toHaveBeenCalledOnceWith(ROOM_CONFIG);
			expect(joinService.initialize).toHaveBeenCalledTimes(1);
		});

		it('stays on the join screen while the form cannot be submitted', () => {
			joinService.submit.and.returnValue(false);

			flow.completeJoinScreen();

			expect(flow.step()).toBe('join');
		});
	});

	it('does nothing on a submit outside the join screen', () => {
		flow.completeJoinScreen();

		expect(flow.step()).toBe('preparing');
		expect(joinService.submit).not.toHaveBeenCalled();
	});

	it('ends at left once the participant leaves', async () => {
		await flow.start();
		flow.completeJoinScreen();

		flow.left();

		expect(flow.step()).toBe('left');
	});
});
