import { Clipboard } from '@angular/cdk/clipboard';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import { LeaveRedirectService } from '../../../shared/services/leave-redirect.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { AuthService } from '../../auth/services/auth.service';
import { RecordingService } from '../../recordings/services/recording.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomService } from '../../rooms/services/room.service';
import { MeetingContextService } from './meeting-context.service';
import { MeetingJoinService } from './meeting-join.service';
import { RoomAccessLinkService } from './room-access-link.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

describe('MeetingJoinService', () => {
	const ROOM_ID = 'room1';

	let service: MeetingJoinService;
	let roomService: jasmine.SpyObj<RoomService>;
	let roomMemberContext: jasmine.SpyObj<RoomMemberContextService>;
	let meetingContextStub: {
		roomId: () => string;
		roomSecret: () => string;
		e2eeKey: () => string | undefined;
		isE2eeKeyFromUrl: () => boolean;
		setE2eeKey: jasmine.Spy;
		setHasRecordings: jasmine.Spy;
		meetingUI: () => { showJoinMeeting: boolean; showShareAccessLinks: boolean };
	};
	let e2eeEnabled: boolean;
	let speakerPublicLink: string | undefined;
	let embeddedMode: boolean;
	let signedIn: boolean;
	let leaveRedirectUrl: string | undefined;

	beforeEach(() => {
		e2eeEnabled = false;
		embeddedMode = false;
		signedIn = false;
		leaveRedirectUrl = undefined;
		speakerPublicLink = undefined;
		roomService = jasmine.createSpyObj<RoomService>('RoomService', ['getRoom']);
		roomService.getRoom.and.callFake(
			async () =>
				({
					roomId: ROOM_ID,
					roomName: 'Room One',
					status: MeetRoomStatus.OPEN,
					config: { e2ee: { enabled: e2eeEnabled } }
				}) as never
		);

		roomMemberContext = jasmine.createSpyObj<RoomMemberContextService>('RoomMemberContextService', [
			'generateToken',
			'hasPermission',
			'memberName',
			'participantName',
			'isParticipantNameFromUrl'
		]);
		roomMemberContext.generateToken.and.resolveTo('minted-token');
		roomMemberContext.hasPermission.and.returnValue(false);
		roomMemberContext.memberName.and.returnValue(undefined);
		roomMemberContext.participantName.and.returnValue(undefined);
		roomMemberContext.isParticipantNameFromUrl.and.returnValue(false);

		meetingContextStub = {
			roomId: () => ROOM_ID,
			roomSecret: () => 'secret',
			e2eeKey: () => undefined,
			isE2eeKeyFromUrl: () => false,
			setE2eeKey: jasmine.createSpy('setE2eeKey'),
			setHasRecordings: jasmine.createSpy('setHasRecordings'),
			meetingUI: () => ({ showJoinMeeting: true, showShareAccessLinks: false })
		};

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingJoinService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: RoomService, useValue: roomService },
				{ provide: RoomMemberContextService, useValue: roomMemberContext },
				{ provide: MeetingContextService, useValue: meetingContextStub },
				{ provide: RoomAccessLinkService, useValue: { speakerPublicLink: () => speakerPublicLink } },
				{ provide: RecordingService, useValue: { listRecordings: async () => ({ recordings: [] }) } },
				{
					provide: AuthService,
					useValue: { isUserAuthenticated: async () => signedIn, getUserName: async () => undefined }
				},
				{ provide: NavigationService, useValue: {} },
				{ provide: LeaveRedirectService, useValue: { getLeaveRedirectURL: () => leaveRedirectUrl } },
				{
					provide: RuntimeConfigService,
					useValue: { isWebcomponentMode: () => false, isEmbeddedMode: () => embeddedMode }
				}
			]
		});

		service = TestBed.inject(MeetingJoinService);
	});

	async function enterJoinScreen(name = 'Alice'): Promise<void> {
		await service.initialize();
		service.setParticipantName(name);
	}

	// Everything the join screen renders comes from these computeds: the room's name, whether it
	// still accepts anyone, whether a key is needed, and the name and link fields.
	describe('what the join screen shows', () => {
		it('exposes the room it loaded', async () => {
			await service.initialize();

			expect(service.roomName()).toBe('Room One');
			expect(service.roomClosed()).toBeFalse();
			expect(service.hasRoomE2EEEnabled()).toBeFalse();
			expect(service.canJoinMeeting()).toBeTrue();
		});

		it('reports a closed room as closed', async () => {
			roomService.getRoom.and.resolveTo({
				roomId: ROOM_ID,
				roomName: 'Room One',
				status: MeetRoomStatus.CLOSED,
				config: { e2ee: { enabled: false } }
			} as never);

			await service.initialize();

			expect(service.roomClosed()).toBeTrue();
		});

		it('asks for the key of an encrypted room', async () => {
			e2eeEnabled = true;

			await service.initialize();

			expect(service.hasRoomE2EEEnabled()).toBeTrue();
			expect(service.showE2EEKeyInput()).toBeTrue();
		});

		it('does not ask for a key the access url already carried', async () => {
			e2eeEnabled = true;
			meetingContextStub.e2eeKey = () => 'passphrase';
			meetingContextStub.isE2eeKeyFromUrl = () => true;

			await service.initialize();
			service.setParticipantName('Ana');

			expect(service.showE2EEKeyInput()).toBeFalse();
			expect(service.e2eeKeyValue()).toBe('passphrase');
		});

		it('trims the name and the key before anything else sees them', async () => {
			e2eeEnabled = true;
			await service.initialize();

			service.setParticipantName('  Ana  ');
			service.setE2eeKey('  passphrase  ');

			expect(service.participantName()).toBe('Ana');
			expect(service.e2eeKeyValue()).toBe('passphrase');
		});

		it('has no name to join with while the field holds only spaces', async () => {
			await service.initialize();

			service.setParticipantName('   ');

			expect(service.participantName()).toBe('');
		});

		it('leaves the name field alone when the participant is the one naming themselves', async () => {
			await service.initialize();

			expect(service.isParticipantNameDisabled()).toBeFalse();
		});

		it('locks the name field when the membership already names the participant', async () => {
			roomMemberContext.memberName.and.returnValue('Ana');

			await service.initialize();
			await Promise.resolve();

			expect(service.isParticipantNameDisabled()).toBeTrue();
			expect(service.participantName()).toBe('Ana');
		});

		it('has no access url to share until one exists', async () => {
			await service.initialize();

			expect(service.roomAccessUrl()).toBe('');
			expect(service.showShareLink()).toBeFalse();
		});

		it('offers the access url to a participant allowed to share it', async () => {
			speakerPublicLink = 'https://meet.example.com/room/room1?secret=abc';
			meetingContextStub.meetingUI = () => ({ showJoinMeeting: true, showShareAccessLinks: true });

			await service.initialize();

			expect(service.roomAccessUrl()).toBe(speakerPublicLink);
			expect(service.showShareLink()).toBeTrue();
		});

		it('refuses to open a join screen for no room', async () => {
			meetingContextStub.roomId = () => '';

			await expectAsync(service.initialize()).toBeRejected();
			expect(service.roomName()).toBeUndefined();
		});
	});

	// The iframe goes by the embedded element's rule, as its end screen does: it has no console to go
	// back to, and the host page can act on embeddedCloseRequested.
	describe('the back button', () => {
		const backButtonAfterInit = async (): Promise<string | null> => {
			await service.initialize();
			await new Promise((resolve) => setTimeout(resolve));
			return service.showBackButton() ? service.backButtonText() : null;
		};

		it('reads Back in an iframe for a signed-in user', async () => {
			embeddedMode = true;
			signedIn = true;

			expect(await backButtonAfterInit()).toBe('JOIN.BACK');
		});

		it('reads Back in an iframe for an anonymous participant', async () => {
			embeddedMode = true;

			expect(await backButtonAfterInit()).toBe('JOIN.BACK');
		});

		it('reads Back in an iframe with a leave redirect', async () => {
			embeddedMode = true;
			leaveRedirectUrl = 'https://example.com/left';

			expect(await backButtonAfterInit()).toBe('JOIN.BACK');
		});

		it('goes back to the rooms of a signed-in user in the standalone app', async () => {
			signedIn = true;

			expect(await backButtonAfterInit()).toBe('JOIN.BACK_TO_ROOMS');
		});

		it('is absent for an anonymous participant in the standalone app', async () => {
			expect(await backButtonAfterInit()).toBeNull();
		});
	});

	describe('submitting the join screen', () => {
		it('takes the form without requesting a token', async () => {
			await enterJoinScreen();

			expect(service.submit()).toBeTrue();
			expect(roomMemberContext.generateToken).not.toHaveBeenCalled();
		});

		it('refuses an empty participant name', async () => {
			await enterJoinScreen('');

			expect(service.submit()).toBeFalse();
		});

		it('refuses an E2EE room with no key', async () => {
			e2eeEnabled = true;
			await enterJoinScreen();

			expect(service.submit()).toBeFalse();
		});

		it('keeps the key typed for an E2EE room', async () => {
			e2eeEnabled = true;
			await enterJoinScreen();
			service.setE2eeKey('passphrase');

			expect(service.submit()).toBeTrue();
			expect(meetingContextStub.setE2eeKey).toHaveBeenCalledWith('passphrase');
		});
	});

	describe('what the participant joins as', () => {
		it('is the name and key entered, typed by the participant', async () => {
			e2eeEnabled = true;
			await enterJoinScreen();
			service.setE2eeKey('passphrase');

			expect(service.joinRequest()).toEqual({
				participantName: 'Alice',
				e2eeKey: 'passphrase',
				nameTypedByParticipant: true
			});
		});

		it('says the name was not typed when the membership gave it', async () => {
			roomMemberContext.memberName.and.returnValue('Ana');
			await service.initialize();
			await Promise.resolve();

			expect(service.joinRequest()).toEqual({
				participantName: 'Ana',
				e2eeKey: '',
				nameTypedByParticipant: false
			});
		});

		it('reads a name set after it was first asked for', async () => {
			await service.initialize();
			expect(service.joinRequest().participantName).toBe('');

			service.setParticipantName('Alice');

			expect(service.joinRequest().participantName).toBe('Alice');
		});
	});

	describe('what the join screen would ask or tell', () => {
		it('has nothing to ask a named participant of an open room', async () => {
			await enterJoinScreen();

			expect(service.joinScreenState()).toEqual({
				nameKnown: true,
				e2eeKeyMissing: false,
				roomClosed: false,
				canJoinMeeting: true
			});
		});

		it('asks for a name and for the key of an encrypted room', async () => {
			e2eeEnabled = true;
			await service.initialize();

			expect(service.joinScreenState()).toEqual(
				jasmine.objectContaining({ nameKnown: false, e2eeKeyMissing: true })
			);
		});

		it('tells a participant who may not join', async () => {
			meetingContextStub.meetingUI = () => ({ showJoinMeeting: false, showShareAccessLinks: false });
			await enterJoinScreen();

			expect(service.joinScreenState().canJoinMeeting).toBeFalse();
		});
	});

	describe('the room access link to share', () => {
		const roomWithSpeakerAccess = (enabled: boolean) =>
			({
				access: {
					user: { url: 'https://meet.example.com/room/room1' },
					anonymous: { speaker: { enabled, url: 'https://meet.example.com/room/room1?secret=abc' } }
				}
			}) as never;

		const loadLinks = async (speakerAccessEnabled: boolean): Promise<RoomAccessLinkService> => {
			roomService.getRoom.and.resolveTo(roomWithSpeakerAccess(speakerAccessEnabled));
			TestBed.resetTestingModule();
			TestBed.configureTestingModule({
				providers: [
					provideZonelessChangeDetection(),
					RoomAccessLinkService,
					{ provide: LoggerService, useClass: LoggerServiceStub },
					{ provide: RoomService, useValue: roomService },
					{
						provide: RoomMemberContextService,
						useValue: { roomId: () => ROOM_ID, permissions: () => ({ roomShareAccessLinks: true }) }
					},
					{ provide: Clipboard, useValue: { copy: () => true } },
					{ provide: NotificationService, useValue: { showMessage: () => undefined } }
				]
			});

			const links = TestBed.inject(RoomAccessLinkService);
			TestBed.tick();
			await roomService.getRoom.calls.mostRecent().returnValue;
			return links;
		};

		it('is offered while the room has its anonymous speaker access enabled', async () => {
			const links = await loadLinks(true);

			expect(links.speakerPublicLink()).toBe('meet.example.com/room/room1');
			expect(links.speakerCopyLink()).toBe('https://meet.example.com/room/room1?secret=abc');
			expect(links.speakerLinkDisabled()).toBeFalse();
		});

		it('is not offered when the room has its anonymous speaker access disabled', async () => {
			const links = await loadLinks(false);

			expect(links.speakerPublicLink()).toBeUndefined();
			expect(links.speakerCopyLink()).toBeUndefined();
			expect(links.speakerLinkDisabled()).toBeTrue();
		});
	});
});
