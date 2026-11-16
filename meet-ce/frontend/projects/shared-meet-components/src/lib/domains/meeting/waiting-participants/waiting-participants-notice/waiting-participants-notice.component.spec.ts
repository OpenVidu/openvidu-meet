import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeetWaitingParticipantType } from '@openvidu-meet/typings';
import { Subject } from 'rxjs';
import { NotificationOptions, ShownNotification } from '../../../../shared/models/notification.model';
import { LoggerService } from '../../../../shared/services/logger.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { PanelType } from '../../openvidu-components/models/panel.model';
import { PanelService } from '../../openvidu-components/services/panel/panel.service';
import { WaitingParticipantsAdminService, WaitingParticipantView } from '../waiting-participants-admin.service';
import { WaitingParticipantsNoticeComponent } from './waiting-participants-notice.component';

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

const waiter = (identity: string, name = identity): WaitingParticipantView => ({
	participant: {
		participantIdentity: identity,
		participantName: name,
		type: MeetWaitingParticipantType.ANONYMOUS,
		knockDate: 0
	},
	name,
	knockedAt: 0,
	color: 'hsl(40, 100%, 80%)'
});

describe('WaitingParticipantsNoticeComponent', () => {
	let fixture: ComponentFixture<WaitingParticipantsNoticeComponent>;
	let notifications: NotificationServiceFake;
	let waiting: ReturnType<typeof signal<WaitingParticipantView[]>>;
	let arrivals: Subject<WaitingParticipantView[]>;
	let panelOpen: ReturnType<typeof signal<boolean>>;
	let waitingAdmin: jasmine.SpyObj<WaitingParticipantsAdminService>;
	let togglePanel: jasmine.Spy;

	beforeEach(async () => {
		waiting = signal<WaitingParticipantView[]>([]);
		arrivals = new Subject<WaitingParticipantView[]>();
		panelOpen = signal(false);
		togglePanel = jasmine.createSpy('togglePanel');
		waitingAdmin = jasmine.createSpyObj<WaitingParticipantsAdminService>(
			'WaitingParticipantsAdminService',
			['admit', 'reject'],
			{
				waiting,
				arrivals$: arrivals.asObservable()
			}
		);
		waitingAdmin.admit.and.resolveTo();
		waitingAdmin.reject.and.resolveTo();

		await TestBed.configureTestingModule({
			imports: [WaitingParticipantsNoticeComponent],
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: WaitingParticipantsAdminService, useValue: waitingAdmin },
				{ provide: PanelService, useValue: { isParticipantsPanelOpened: panelOpen, togglePanel } },
				{ provide: NotificationService, useClass: NotificationServiceFake }
			]
		}).compileComponents();

		notifications = TestBed.inject(NotificationService) as unknown as NotificationServiceFake;
		fixture = TestBed.createComponent(WaitingParticipantsNoticeComponent);
		fixture.detectChanges();
		await fixture.whenStable();
	});

	/** The server's list as the service hands it over: the new list first, then who arrived in it. */
	async function line(current: WaitingParticipantView[], arrived: WaitingParticipantView[] = []): Promise<void> {
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
		expect(notice.avatars).toEqual([{ name: 'Zoe', color: zoe.color }]);
		expect(notice.message).toEqual({ key: 'WAITING_PARTICIPANTS.ADMIN.WANTS_TO_JOIN' });

		notice.secondaryAction!.run();
		notice.action!.run();

		expect(waitingAdmin.reject).toHaveBeenCalledOnceWith('zoe');
		expect(waitingAdmin.admit).toHaveBeenCalledOnceWith('zoe');
	});

	it('stacks the avatars of three people at most', async () => {
		const waiting = ['ana', 'ben', 'cleo', 'dan'].map((name) => waiter(name));
		await line(waiting, waiting);

		expect(shown()[0].avatars?.map(({ name }) => name)).toEqual(['ana', 'ben', 'cleo']);
	});

	it('groups several into one notification, counted, with View opening the panel', async () => {
		const ana = waiter('ana');
		const ben = waiter('ben');
		await line([ana], [ana]);
		await line([ana, ben], [ben]);

		const [notice] = shown();
		expect(shown().length).toBe(1);
		expect(notice.title).toEqual({ key: 'WAITING_PARTICIPANTS.ADMIN.WAITING_COUNT', params: { count: 2 } });
		expect(notice.message).toBe('ana, ben');
		expect(notice.avatars?.map(({ name }) => name)).toEqual(['ana', 'ben']);
		expect(notice.secondaryAction).toBeUndefined();

		notice.action!.run();

		expect(togglePanel).toHaveBeenCalledOnceWith(PanelType.PARTICIPANTS);
	});

	it('follows the waiting list, and goes once nobody it announces waits', async () => {
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
