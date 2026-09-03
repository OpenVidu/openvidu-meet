import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetRoomMemberTokenOptions, MeetRoomStatus } from '@openvidu-meet/typings';
import { LeaveRedirectService } from '../../../shared/services/leave-redirect.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { AuthService } from '../../auth/services/auth.service';
import { RecordingService } from '../../recordings/services/recording.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomService } from '../../rooms/services/room.service';
import { E2eeService } from '../openvidu-components/services/e2ee/e2ee.service';
import { MeetingContextService } from './meeting-context.service';
import { MeetingLobbyService } from './meeting-lobby.service';
import { RoomAccessLinkService } from './room-access-link.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

describe('MeetingLobbyService', () => {
	const ROOM_ID = 'room1';

	let service: MeetingLobbyService;
	let roomService: jasmine.SpyObj<RoomService>;
	let roomMemberContext: jasmine.SpyObj<RoomMemberContextService>;
	let e2eeService: jasmine.SpyObj<E2eeService>;
	let meetingContextStub: {
		roomId: () => string;
		roomSecret: () => string;
		e2eeKey: () => string | undefined;
		isE2eeKeyFromUrl: () => boolean;
		setE2eeKey: jasmine.Spy;
		setHasRecordings: jasmine.Spy;
		setIsActiveMeeting: jasmine.Spy;
		meetingUI: () => { showJoinMeeting: boolean; showShareAccessLinks: boolean };
	};
	let e2eeEnabled: boolean;

	beforeEach(() => {
		e2eeEnabled = false;
		roomService = jasmine.createSpyObj<RoomService>('RoomService', ['getRoom', 'loadRoomConfig']);
		roomService.getRoom.and.callFake(
			async () =>
				({
					roomId: ROOM_ID,
					roomName: 'Room One',
					status: MeetRoomStatus.OPEN,
					config: { e2ee: { enabled: e2eeEnabled } }
				}) as never
		);
		roomService.loadRoomConfig.and.resolveTo(undefined);

		roomMemberContext = jasmine.createSpyObj<RoomMemberContextService>('RoomMemberContextService', [
			'generateToken',
			'saveParticipantNameToStorage',
			'hasPermission',
			'memberName',
			'participantName',
			'isParticipantNameFromUrl',
			'participantExternalId',
			'participantMetadata'
		]);
		roomMemberContext.generateToken.and.resolveTo('minted-token');
		roomMemberContext.hasPermission.and.returnValue(false);
		roomMemberContext.memberName.and.returnValue(undefined);
		roomMemberContext.participantName.and.returnValue(undefined);
		roomMemberContext.isParticipantNameFromUrl.and.returnValue(false);
		roomMemberContext.participantExternalId.and.returnValue(undefined);
		roomMemberContext.participantMetadata.and.returnValue(undefined);

		e2eeService = jasmine.createSpyObj<E2eeService>('E2eeService', ['setE2EEKey', 'encrypt']);
		e2eeService.setE2EEKey.and.resolveTo(undefined);
		// `encrypt` is overloaded (text and bytes); the lobby only ever encrypts the display name.
		e2eeService.encrypt.and.callFake((async (value: string) => `encrypted(${value})`) as E2eeService['encrypt']);

		meetingContextStub = {
			roomId: () => ROOM_ID,
			roomSecret: () => 'secret',
			e2eeKey: () => undefined,
			isE2eeKeyFromUrl: () => false,
			setE2eeKey: jasmine.createSpy('setE2eeKey'),
			setHasRecordings: jasmine.createSpy('setHasRecordings'),
			setIsActiveMeeting: jasmine.createSpy('setIsActiveMeeting'),
			meetingUI: () => ({ showJoinMeeting: true, showShareAccessLinks: false })
		};

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingLobbyService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: RoomService, useValue: roomService },
				{ provide: RoomMemberContextService, useValue: roomMemberContext },
				{ provide: E2eeService, useValue: e2eeService },
				{ provide: MeetingContextService, useValue: meetingContextStub },
				{ provide: RoomAccessLinkService, useValue: { speakerPublicLink: () => undefined } },
				{ provide: RecordingService, useValue: { listRecordings: async () => ({ recordings: [] }) } },
				{
					provide: AuthService,
					useValue: { isUserAuthenticated: async () => false, getUserName: async () => undefined }
				},
				{ provide: NavigationService, useValue: { redirectToErrorPage: async () => undefined } },
				{ provide: LeaveRedirectService, useValue: { getLeaveRedirectURL: () => undefined } },
				{
					provide: RuntimeConfigService,
					useValue: { isWebcomponentMode: () => false, isEmbeddedMode: () => false }
				}
			]
		});

		service = TestBed.inject(MeetingLobbyService);
	});

	async function enterLobby(name = 'Alice'): Promise<void> {
		await service.initialize();
		service.setParticipantName(name);
	}

	function joinTokenOptions(): MeetRoomMemberTokenOptions {
		return roomMemberContext.generateToken.calls.mostRecent().args[1];
	}

	describe('clearing the lobby', () => {
		it('grants access to the prejoin without minting a token', async () => {
			await enterLobby();
			await service.submitAccess();

			expect(service.accessGranted()).toBeTrue();
			expect(roomMemberContext.generateToken).not.toHaveBeenCalled();
			expect(meetingContextStub.setIsActiveMeeting).not.toHaveBeenCalled();
		});

		it('loads the room config before granting access, so the prejoin opens the devices from it', async () => {
			await enterLobby();

			let configLoaded = false;
			roomService.loadRoomConfig.and.callFake(async () => {
				configLoaded = true;
			});

			await service.submitAccess();

			expect(configLoaded).toBeTrue();
			expect(roomService.loadRoomConfig).toHaveBeenCalledWith(ROOM_ID);
		});

		it('grants access even when the room config could not be loaded', async () => {
			await enterLobby();
			roomService.loadRoomConfig.and.rejectWith(new Error('boom'));

			await service.submitAccess();

			expect(service.accessGranted()).toBeTrue();
		});

		it('refuses an empty participant name', async () => {
			await enterLobby('');

			await expectAsync(service.submitAccess()).toBeRejected();
			expect(service.accessGranted()).toBeFalse();
		});

		it('refuses to grant access to an E2EE room with no key', async () => {
			e2eeEnabled = true;
			await enterLobby();

			await expectAsync(service.submitAccess()).toBeRejected();
			expect(service.accessGranted()).toBeFalse();
		});
	});

	describe('committing to the join', () => {
		it('mints a joining token for the name entered in the lobby', async () => {
			await enterLobby();
			await service.submitAccess();

			await expectAsync(service.generateJoinToken()).toBeResolvedTo('minted-token');

			expect(roomMemberContext.generateToken).toHaveBeenCalledTimes(1);
			expect(joinTokenOptions()).toEqual(
				jasmine.objectContaining({ joinMeeting: true, participantName: 'Alice', secret: 'secret' })
			);
			expect(meetingContextStub.setIsActiveMeeting).toHaveBeenCalledWith(true);
		});

		it('encrypts the display name of an E2EE meeting before it reaches the token', async () => {
			e2eeEnabled = true;
			await enterLobby();
			service.setE2eeKey('passphrase');
			await service.submitAccess();

			await service.generateJoinToken();

			expect(e2eeService.setE2EEKey).toHaveBeenCalledWith('passphrase');
			expect(joinTokenOptions().participantName).toBe('encrypted(Alice)');
		});

		it('reports the failure to mint instead of leaving the caller with no token', async () => {
			await enterLobby();
			await service.submitAccess();
			roomMemberContext.generateToken.and.rejectWith({ status: 409, error: { message: 'Room is closed' } });

			await expectAsync(service.generateJoinToken()).toBeRejected();
			expect(meetingContextStub.setIsActiveMeeting).not.toHaveBeenCalled();
		});
	});
});
