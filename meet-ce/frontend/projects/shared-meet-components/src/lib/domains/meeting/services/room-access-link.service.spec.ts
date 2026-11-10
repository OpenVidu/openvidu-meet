import { Clipboard } from '@angular/cdk/clipboard';
import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
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

const sharer = (permissions: Partial<MeetRoomMemberPermissions> = {}) =>
	({ roomShareAccessLinks: true, ...permissions }) as MeetRoomMemberPermissions;

describe('RoomAccessLinkService', () => {
	let service: RoomAccessLinkService;
	let getRoom: jasmine.Spy;
	let clipboard: jasmine.SpyObj<Clipboard>;
	let permissions: WritableSignal<MeetRoomMemberPermissions | undefined>;

	const settle = async () => {
		TestBed.tick();
		await new Promise((resolve) => setTimeout(resolve));
	};

	async function load(...rooms: (MeetRoom | Promise<MeetRoom>)[]) {
		getRoom = jasmine.createSpy('getRoom').and.returnValues(...rooms.map((room) => Promise.resolve(room)));
		clipboard = jasmine.createSpyObj<Clipboard>('Clipboard', ['copy']);
		permissions = signal(sharer());

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: Clipboard, useValue: clipboard },
				{ provide: RoomService, useValue: { getRoom } },
				{ provide: RoomMemberContextService, useValue: { roomId: signal('r1'), permissions } },
				{ provide: NotificationService, useValue: { showMessage: () => {} } },
				{
					provide: LoggerService,
					useValue: { get: () => ({ d: () => {}, v: () => {}, w: () => {}, e: () => {} }) }
				}
			]
		});
		service = TestBed.inject(RoomAccessLinkService);
		await settle();
	}

	it('exposes the speaker link the server returned', async () => {
		await load(roomWith({ enabled: true, url: SPEAKER_URL }));

		expect(service.speakerCopyLink()).toBe(SPEAKER_URL);
		expect(service.speakerPublicLink()).toBe('meet.example.com/room/r1');
		expect(service.speakerLinkUnavailable()).toBeFalse();
	});

	it('exposes no link and marks it unavailable when the server left the speaker URL out', async () => {
		await load(roomWith({ enabled: true }));

		expect(service.speakerCopyLink()).toBeUndefined();
		expect(service.speakerPublicLink()).toBeUndefined();
		expect(service.speakerLinkUnavailable()).toBeTrue();
	});

	it('copies nothing when the server left the speaker URL out', async () => {
		await load(roomWith({ enabled: true }), roomWith({ enabled: true }));

		await service.copyRoomAccessLink();

		expect(clipboard.copy).not.toHaveBeenCalled();
	});

	it('marks the link unavailable when the anonymous speaker access is disabled', async () => {
		await load(roomWith({ enabled: false, url: SPEAKER_URL }));

		expect(service.speakerCopyLink()).toBeUndefined();
		expect(service.speakerLinkUnavailable()).toBeTrue();
	});

	it('asks the server again when new permissions keep the share permission', async () => {
		await load(roomWith({ enabled: true }), roomWith({ enabled: true, url: SPEAKER_URL }));

		permissions.set(sharer({ chatWrite: true }));
		await settle();

		expect(getRoom).toHaveBeenCalledTimes(2);
		expect(service.speakerCopyLink()).toBe(SPEAKER_URL);
		expect(service.speakerLinkUnavailable()).toBeFalse();
	});

	it('drops the link when new permissions no longer reach it', async () => {
		await load(roomWith({ enabled: true, url: SPEAKER_URL }), roomWith({ enabled: true }));

		permissions.set(sharer({ chatWrite: false }));
		await settle();

		expect(service.speakerCopyLink()).toBeUndefined();
		expect(service.speakerLinkUnavailable()).toBeTrue();
	});

	it('keeps the answer to the latest permissions when an earlier request answers last', async () => {
		let answerFirst!: (room: MeetRoom) => void;
		const first = new Promise<MeetRoom>((resolve) => (answerFirst = resolve));
		await load(first, roomWith({ enabled: true, url: SPEAKER_URL }));

		permissions.set(sharer({ chatWrite: true }));
		await settle();
		answerFirst(roomWith({ enabled: true }));
		await settle();

		expect(service.speakerCopyLink()).toBe(SPEAKER_URL);
	});
});
