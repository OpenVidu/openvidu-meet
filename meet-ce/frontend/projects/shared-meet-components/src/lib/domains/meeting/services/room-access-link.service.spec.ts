import { Clipboard } from '@angular/cdk/clipboard';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetRoom, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { LoggerService } from '../../../shared/services/logger.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomService } from '../../rooms/services/room.service';
import { RoomAccessLinkService } from './room-access-link.service';

const SPEAKER_URL = 'https://meet.example.com/room/r1?secret=speaker';

const roomWith = (speaker: { enabled: boolean; url?: string }) =>
	({
		access: {
			anonymous: { moderator: { enabled: true }, speaker, recording: { enabled: true } },
			user: { enabled: true, url: 'https://meet.example.com/room/r1' }
		}
	}) as MeetRoom;

describe('RoomAccessLinkService', () => {
	let service: RoomAccessLinkService;
	let getRoom: jasmine.Spy;
	let clipboard: jasmine.SpyObj<Clipboard>;

	async function load(room: MeetRoom) {
		getRoom = jasmine.createSpy('getRoom').and.resolveTo(room);
		clipboard = jasmine.createSpyObj<Clipboard>('Clipboard', ['copy']);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: Clipboard, useValue: clipboard },
				{ provide: RoomService, useValue: { getRoom } },
				{
					provide: RoomMemberContextService,
					useValue: {
						roomId: signal('r1'),
						permissions: signal({ roomShareAccessLinks: true } as MeetRoomMemberPermissions)
					}
				},
				{ provide: NotificationService, useValue: { showMessage: () => {} } },
				{
					provide: LoggerService,
					useValue: { get: () => ({ d: () => {}, v: () => {}, w: () => {}, e: () => {} }) }
				}
			]
		});
		service = TestBed.inject(RoomAccessLinkService);
		TestBed.tick();
		await getRoom.calls.mostRecent().returnValue;
		await Promise.resolve();
	}

	it('exposes the speaker link the server returned', async () => {
		await load(roomWith({ enabled: true, url: SPEAKER_URL }));

		expect(service.speakerCopyLink()).toBe(SPEAKER_URL);
		expect(service.speakerPublicLink()).toBe('meet.example.com/room/r1');
		expect(service.speakerLinkDisabled()).toBeFalse();
	});

	it('exposes no link and marks it unavailable when the server left the speaker URL out', async () => {
		await load(roomWith({ enabled: true }));

		expect(service.speakerCopyLink()).toBeUndefined();
		expect(service.speakerPublicLink()).toBeUndefined();
		expect(service.speakerLinkDisabled()).toBeTrue();
	});

	it('copies nothing when the server left the speaker URL out', async () => {
		await load(roomWith({ enabled: true }));

		await service.copyRoomAccessLink();

		expect(clipboard.copy).not.toHaveBeenCalled();
	});

	it('marks the link unavailable when the anonymous speaker access is disabled', async () => {
		await load(roomWith({ enabled: false, url: SPEAKER_URL }));

		expect(service.speakerCopyLink()).toBeUndefined();
		expect(service.speakerLinkDisabled()).toBeTrue();
	});
});
