import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SessionStorageKeys } from '../../../shared/models/storage.model';
import { BrowserStorageService } from '../../../shared/services/browser-storage.service';
import { GlobalConfigService } from '../../../shared/services/global-config.service';
import { LeaveRedirectService } from '../../../shared/services/leave-redirect.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { parseOptionalBoolean } from '../../../shared/utils/url.utils';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomAccessService } from '../../rooms/services/room-access.service';
import { RoomFeatureService } from '../../rooms/services/room-feature.service';
import { ViewportService } from '../openvidu-components';
import { MeetingContextService } from './meeting-context.service';
import { MeetingEntryService } from './meeting-entry.service';
import { RoomAccessLinkService } from './room-access-link.service';

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

	it('sends a bare show-only-recordings query parameter to the room recordings', () => {
		const decision = service.prepare({ roomId: 'room-b', showOnlyRecordings: parseOptionalBoolean('') });

		expect(decision).toEqual({ kind: 'redirect', to: '/room/room-b/recordings' });
	});
});

describe('MeetingEntryService.prepare (secret and encryption key kept per room)', () => {
	let service: MeetingEntryService;
	let context: MeetingContextService;
	let sessionStorageService: SessionStorageService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingEntryService,
				MeetingContextService,
				{ provide: LoggerService, useValue: { get: () => ({ d: () => {}, w: () => {}, e: () => {} }) } },
				{
					provide: RoomFeatureService,
					useValue: jasmine.createSpyObj<RoomFeatureService>('RoomFeatureService', [
						'reset',
						'setInitialMediaRequest'
					])
				},
				{
					provide: RoomMemberContextService,
					useValue: jasmine.createSpyObj<RoomMemberContextService>('RoomMemberContextService', [
						'setParticipantExternalId',
						'setParticipantMetadata',
						'setParticipantName',
						'loadParticipantNameFromStorage'
					])
				},
				{ provide: RoomAccessService, useValue: {} },
				{ provide: LeaveRedirectService, useValue: { handleLeaveRedirectUrl: () => undefined } },
				{ provide: GlobalConfigService, useValue: {} },
				{ provide: ViewportService, useValue: {} },
				{ provide: RoomAccessLinkService, useValue: {} }
			]
		});
		service = TestBed.inject(MeetingEntryService);
		context = TestBed.inject(MeetingContextService);
		sessionStorageService = TestBed.inject(SessionStorageService);
		sessionStorageService.clearMeetingData();
	});

	afterEach(() => sessionStorageService.clearMeetingData());

	it('restores the secret and the key when the same room is entered again without them', () => {
		service.prepare({ roomId: 'room-a', secret: 'secret-a', e2eeKey: 'key-a' });

		service.prepare({ roomId: 'room-a' });

		expect(context.roomSecret()).toBe('secret-a');
		expect(context.e2eeKey()).toBe('key-a');
		expect(context.isE2eeKeyFromUrl()).toBeTrue();
	});

	it('enters another room without them with neither', () => {
		service.prepare({ roomId: 'room-a', secret: 'secret-a', e2eeKey: 'key-a' });

		service.prepare({ roomId: 'room-b' });

		expect(context.roomSecret()).toBeUndefined();
		expect(context.e2eeKey()).toBe('');
		expect(context.isE2eeKeyFromUrl()).toBeFalse();
	});

	it('ignores a secret and a key stored before they were kept with their room', () => {
		const storage = TestBed.inject(BrowserStorageService);
		storage.set(SessionStorageKeys.ROOM_SECRET, 'old-secret', 'session');
		storage.set(SessionStorageKeys.E2EE_DATA, { key: 'old-key', fromUrl: true }, 'session');

		service.prepare({ roomId: 'room-a' });

		expect(context.roomSecret()).toBeUndefined();
		expect(context.e2eeKey()).toBe('');
	});
});
