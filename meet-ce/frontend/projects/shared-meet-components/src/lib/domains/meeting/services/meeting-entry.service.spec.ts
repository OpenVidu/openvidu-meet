import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LeaveRedirectService } from '../../../shared/services/leave-redirect.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomAccessService } from '../../rooms/services/room-access.service';
import { RoomFeatureService } from '../../rooms/services/room-feature.service';
import { MeetingContextService } from './meeting-context.service';
import { MeetingEntryService } from './meeting-entry.service';

describe('MeetingEntryService.prepare (resets the previous room feature state)', () => {
	let service: MeetingEntryService;
	let roomFeatureService: jasmine.SpyObj<RoomFeatureService>;

	beforeEach(() => {
		roomFeatureService = jasmine.createSpyObj<RoomFeatureService>('RoomFeatureService', [
			'reset',
			'setInitialMediaRequest'
		]);
		const meetingContextService = jasmine.createSpyObj<MeetingContextService>('MeetingContextService', [
			'setRoomId',
			'setRoomSecret',
			'loadRoomSecretFromStorage',
			'setE2eeKey',
			'loadE2eeKeyFromStorage'
		]);
		const roomMemberContextService = jasmine.createSpyObj<RoomMemberContextService>('RoomMemberContextService', [
			'setParticipantExternalId',
			'setParticipantMetadata',
			'setParticipantName',
			'loadParticipantNameFromStorage'
		]);
		const roomAccessService = jasmine.createSpyObj<RoomAccessService>('RoomAccessService', ['validateAccess']);
		const leaveRedirectService = jasmine.createSpyObj<LeaveRedirectService>('LeaveRedirectService', [
			'handleLeaveRedirectUrl'
		]);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingEntryService,
				{ provide: MeetingContextService, useValue: meetingContextService },
				{ provide: RoomMemberContextService, useValue: roomMemberContextService },
				{ provide: RoomAccessService, useValue: roomAccessService },
				{ provide: RoomFeatureService, useValue: roomFeatureService },
				{ provide: LeaveRedirectService, useValue: leaveRedirectService }
			]
		});
		service = TestBed.inject(MeetingEntryService);
	});

	it('clears the room feature state on every entry, before seeding the new one', () => {
		roomFeatureService.reset.and.callFake(() => {
			expect(roomFeatureService.setInitialMediaRequest).not.toHaveBeenCalled();
		});

		service.prepare({ roomId: 'room-b' });

		expect(roomFeatureService.reset).toHaveBeenCalled();
		expect(roomFeatureService.setInitialMediaRequest).toHaveBeenCalled();
	});
});
