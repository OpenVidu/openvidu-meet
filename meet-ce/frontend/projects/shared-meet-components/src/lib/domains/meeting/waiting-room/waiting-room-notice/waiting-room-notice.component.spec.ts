import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeetWaitingRoomParticipantType } from '@openvidu-meet/typings';
import { Subject } from 'rxjs';
import { NotificationOptions, ShownNotification } from '../../../../shared/models/notification.model';
import { LoggerService } from '../../../../shared/services/logger.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { PanelType } from '../../openvidu-components/models/panel.model';
import { PanelService } from '../../openvidu-components/services/panel/panel.service';
import { WaitingRoomAdminService, WaitingRoomWaiter } from '../waiting-room-admin.service';
import { WaitingRoomNoticeComponent } from './waiting-room-notice.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

/** The stack the meeting shows below the status rail. */
class NotificationServiceFake {
	private lastId = 0;
	readonly notifications = signal<ShownNotification[]>([]);

	showNotification(options: NotificationOptions): number {
		const id = ++this.lastId;
		this.notifications.update((shown) => [...shown, { ...options, id }]);
		return id;
	}

	updateNotification(id: number, options: NotificationOptions): void {
		this.notifications.update((shown) => shown.map((notice) => (notice.id === id ? { ...options, id } : notice)));
	}

	dismissNotification(id: number): void {
		this.notifications.update((shown) => shown.filter((notice) => notice.id !== id));
	}
}

const waiter = (identity: string, name = identity): WaitingRoomWaiter => ({
	participant: {
		participantIdentity: identity,
		participantName: name,
		type: MeetWaitingRoomParticipantType.ANONYMOUS,
		knockDate: 0
	},
	name,
	knockedAt: 0
});

describe('WaitingRoomNoticeComponent', () => {
	let fixture: ComponentFixture<WaitingRoomNoticeComponent>;
	let notifications: NotificationServiceFake;
	let waiting: ReturnType<typeof signal<WaitingRoomWaiter[]>>;
	let arrivals: Subject<WaitingRoomWaiter[]>;
	let panelOpen: ReturnType<typeof signal<boolean>>;
	let waitingRoomAdmin: jasmine.SpyObj<WaitingRoomAdminService>;
	let togglePanel: jasmine.Spy;

	beforeEach(async () => {
		waiting = signal<WaitingRoomWaiter[]>([]);
		arrivals = new Subject<WaitingRoomWaiter[]>();
		panelOpen = signal(false);
		togglePanel = jasmine.createSpy('togglePanel');
		waitingRoomAdmin = jasmine.createSpyObj<WaitingRoomAdminService>(
			'WaitingRoomAdminService',
			['admit', 'reject'],
			{
				waiting,
				arrivals$: arrivals.asObservable()
			}
		);
		waitingRoomAdmin.admit.and.resolveTo([]);
		waitingRoomAdmin.reject.and.resolveTo([]);

		await TestBed.configureTestingModule({
			imports: [WaitingRoomNoticeComponent],
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: WaitingRoomAdminService, useValue: waitingRoomAdmin },
				{ provide: PanelService, useValue: { isParticipantsPanelOpened: panelOpen, togglePanel } },
				{ provide: NotificationService, useClass: NotificationServiceFake }
			]
		}).compileComponents();

		notifications = TestBed.inject(NotificationService) as unknown as NotificationServiceFake;
		fixture = TestBed.createComponent(WaitingRoomNoticeComponent);
		fixture.detectChanges();
		await fixture.whenStable();
	});

	/** The server's list as the service hands it over: the new line first, then who arrived in it. */
	async function line(current: WaitingRoomWaiter[], arrived: WaitingRoomWaiter[] = []): Promise<void> {
		waiting.set(current);

		if (arrived.length > 0) arrivals.next(arrived);

		await fixture.whenStable();
	}

	const shown = (): NotificationOptions[] => notifications.notifications();

	it('names one participant who asks to join, with Deny and Admit', async () => {
		const zoe = waiter('zoe', 'Zoe');
		await line([zoe], [zoe]);

		const [notice] = shown();
		expect(shown().length).toBe(1);
		expect(notice.title).toBe('Zoe');
		expect(notice.message).toEqual({ key: 'WAITING_ROOM.ADMIN.WANTS_TO_JOIN' });

		notice.secondaryAction!.run();
		notice.action!.run();

		expect(waitingRoomAdmin.reject).toHaveBeenCalledOnceWith(['zoe']);
		expect(waitingRoomAdmin.admit).toHaveBeenCalledOnceWith(['zoe']);
	});

	it('groups several into one notification, counted, with View opening the panel', async () => {
		const ana = waiter('ana');
		const ben = waiter('ben');
		await line([ana], [ana]);
		await line([ana, ben], [ben]);

		const [notice] = shown();
		expect(shown().length).toBe(1);
		expect(notice.title).toEqual({ key: 'WAITING_ROOM.ADMIN.WAITING_COUNT', params: { count: 2 } });
		expect(notice.message).toBe('ana, ben');
		expect(notice.secondaryAction).toBeUndefined();

		notice.action!.run();

		expect(togglePanel).toHaveBeenCalledOnceWith(PanelType.PARTICIPANTS);
	});

	it('follows the line, and goes once nobody it announces waits', async () => {
		const ana = waiter('ana');
		const ben = waiter('ben');
		await line([ana, ben], [ana, ben]);

		await line([ben]);

		expect(shown()[0].title).toBe('ben');

		await line([]);

		expect(shown()).toEqual([]);
	});

	it('raises nothing while the participants panel is open', async () => {
		panelOpen.set(true);
		const zoe = waiter('zoe');

		await line([zoe], [zoe]);

		expect(shown()).toEqual([]);
	});

	it('goes away when the participants panel opens', async () => {
		const zoe = waiter('zoe');
		await line([zoe], [zoe]);

		panelOpen.set(true);
		await fixture.whenStable();

		expect(shown()).toEqual([]);
	});

	it('starts over after the participant closed it', async () => {
		const ana = waiter('ana');
		const zoe = waiter('zoe');
		await line([ana], [ana]);
		notifications.dismissNotification(notifications.notifications()[0].id);

		await line([ana, zoe], [zoe]);

		expect(shown().length).toBe(1);
		expect(shown()[0].title).toBe('zoe');
	});
});
