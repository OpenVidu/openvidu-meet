import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogService } from '../../../shared/services/dialog.service';
import { TranslateService } from '../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { RoomService } from '../../rooms/services/room.service';
import { DEFAULT_MEETING_ENTRY_OPTIONS, JoinScreenState } from '../utils/meeting-entry-flow.utils';
import { MeetingContextService } from './meeting-context.service';
import { MeetingEntryFlowService } from './meeting-entry-flow.service';
import { WaitingRoomService } from '../waiting-room/waiting-room.service';
import { MeetingJoinService } from './meeting-join.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

describe('MeetingEntryFlowService', () => {
	const ROOM_ID = 'room1';
	const ready: JoinScreenState = { nameKnown: true, e2eeKeyMissing: false, roomClosed: false, canJoinMeeting: true };

	let flow: MeetingEntryFlowService;
	let joinService: jasmine.SpyObj<MeetingJoinService>;
	let roomService: jasmine.SpyObj<RoomService>;
	let showDialog: jasmine.Spy;
	let hasPendingWait: jasmine.Spy;

	beforeEach(() => {
		joinService = jasmine.createSpyObj<MeetingJoinService>('MeetingJoinService', [
			'initialize',
			'submit',
			'joinScreenState'
		]);
		joinService.initialize.and.resolveTo();
		joinService.submit.and.returnValue(true);
		joinService.joinScreenState.and.returnValue(ready);

		roomService = jasmine.createSpyObj<RoomService>('RoomService', ['loadRoomConfig']);
		roomService.loadRoomConfig.and.resolveTo(undefined);
		showDialog = jasmine.createSpy('showDialog');
		hasPendingWait = jasmine.createSpy('hasPendingWait').and.returnValue(false);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingEntryFlowService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: MeetingJoinService, useValue: joinService },
				{ provide: RoomService, useValue: roomService },
				{ provide: WaitingRoomService, useValue: { hasPendingWait } },
				{ provide: MeetingContextService, useValue: { roomId: () => ROOM_ID } },
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

	it('shows the join screen once the room has loaded', async () => {
		await flow.start();

		expect(flow.step()).toBe('join');
		expect(roomService.loadRoomConfig).not.toHaveBeenCalled();
	});

	it('goes on to the meeting, without the join screen, to continue a wait a reload interrupted', async () => {
		hasPendingWait.and.returnValue(true);

		await flow.start();

		expect(flow.step()).toBe('meeting');
	});

	it('shows the error step and a dialog when the room cannot be loaded', async () => {
		joinService.initialize.and.rejectWith(new Error('Timeout loading room data'));

		await flow.start();

		expect(flow.step()).toBe('error');
		expect(showDialog).toHaveBeenCalledOnceWith(
			jasmine.objectContaining({ message: 'MEETING_PAGE.INIT_ERROR_MESSAGE' })
		);
	});

	describe('leaving the join screen', () => {
		beforeEach(async () => {
			await flow.start();
		});

		it('enters the meeting', async () => {
			await flow.completeJoinScreen();

			expect(flow.step()).toBe('meeting');
		});

		it('loads the room config before the meeting view mounts', async () => {
			let stepWhileLoading: string | undefined;
			roomService.loadRoomConfig.and.callFake(async () => {
				stepWhileLoading = flow.step();
			});

			await flow.completeJoinScreen();

			expect(roomService.loadRoomConfig).toHaveBeenCalledOnceWith(ROOM_ID);
			expect(stepWhileLoading).toBe('join');
		});

		it('enters the meeting even when the room config could not be loaded', async () => {
			roomService.loadRoomConfig.and.rejectWith(new Error('boom'));

			await flow.completeJoinScreen();

			expect(flow.step()).toBe('meeting');
		});

		it('stays on the join screen while the form cannot be submitted', async () => {
			joinService.submit.and.returnValue(false);

			await flow.completeJoinScreen();

			expect(flow.step()).toBe('join');
			expect(roomService.loadRoomConfig).not.toHaveBeenCalled();
		});
	});

	it('does nothing on a submit outside the join screen', async () => {
		await flow.completeJoinScreen();

		expect(flow.step()).toBe('preparing');
		expect(joinService.submit).not.toHaveBeenCalled();
	});

	it('ends at left once the participant leaves', async () => {
		await flow.start();
		await flow.completeJoinScreen();

		flow.left();

		expect(flow.step()).toBe('left');
	});
});
