import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeetWaitingRoomParticipantType } from '@openvidu-meet/typings';
import { DialogOptions } from '../../../../shared/models/notification.model';
import { DialogService } from '../../../../shared/services/dialog.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import { WaitingRoomAdminService, WaitingRoomWaiter } from '../waiting-room-admin.service';
import { WaitingRoomPanelSectionComponent } from './waiting-room-panel-section.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

const waiter = (identity: string, name: string, type = MeetWaitingRoomParticipantType.USER): WaitingRoomWaiter => ({
	participant: { participantIdentity: identity, participantName: name, type, knockDate: 0 },
	name,
	knockedAt: new Date(2026, 10, 11, 10, 42).getTime()
});

describe('WaitingRoomPanelSectionComponent', () => {
	let fixture: ComponentFixture<WaitingRoomPanelSectionComponent>;
	let waiting: ReturnType<typeof signal<WaitingRoomWaiter[]>>;
	let availablePlaces: ReturnType<typeof signal<number | null>>;
	let waitingRoomAdmin: jasmine.SpyObj<WaitingRoomAdminService>;
	let dialog: jasmine.SpyObj<DialogService>;

	beforeEach(async () => {
		waiting = signal<WaitingRoomWaiter[]>([]);
		availablePlaces = signal<number | null>(null);
		waitingRoomAdmin = jasmine.createSpyObj<WaitingRoomAdminService>(
			'WaitingRoomAdminService',
			['admit', 'reject', 'admitShown'],
			{
				waiting,
				availablePlaces,
				admittable: computed(() => {
					const places = availablePlaces();
					return places === null ? waiting().length : Math.min(places, waiting().length);
				})
			}
		);
		waitingRoomAdmin.admit.and.resolveTo([]);
		waitingRoomAdmin.reject.and.resolveTo([]);
		waitingRoomAdmin.admitShown.and.resolveTo([]);
		dialog = jasmine.createSpyObj<DialogService>('DialogService', ['showDialog']);

		await TestBed.configureTestingModule({
			imports: [WaitingRoomPanelSectionComponent],
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: WaitingRoomAdminService, useValue: waitingRoomAdmin },
				{ provide: DialogService, useValue: dialog },
				{
					provide: TranslateService,
					useValue: {
						translate: (key: string, params?: Record<string, unknown>) =>
							params ? `${key} ${JSON.stringify(params)}` : key,
						translationsLoaded: signal(0)
					}
				}
			]
		}).compileComponents();

		fixture = TestBed.createComponent(WaitingRoomPanelSectionComponent);
	});

	async function render(): Promise<void> {
		fixture.detectChanges();
		await fixture.whenStable();
	}

	const find = (selector: string): HTMLElement | null => fixture.nativeElement.querySelector(selector);
	const rows = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('.waiting-room-row'));

	it('stays out of the panel while nobody waits', async () => {
		await render();

		expect(find('#waiting-room-panel-section')).toBeNull();
	});

	it('lists those waiting in arrival order, marking the rows of a shared link', async () => {
		waiting.set([waiter('ana', 'Ana', MeetWaitingRoomParticipantType.ANONYMOUS), waiter('ben', 'Ben')]);
		await render();

		expect(rows().map((row) => row.dataset['participantIdentity'])).toEqual(['ana', 'ben']);
		expect(rows()[0].querySelector('.waiting-room-shared-link')?.textContent).toContain(
			'WAITING_ROOM.ADMIN.SHARED_LINK'
		);
		expect(rows()[1].querySelector('.waiting-room-shared-link')).toBeNull();
	});

	it('shows when each asked to join next to a name two rows share', async () => {
		waiting.set([waiter('ana-1', 'Ana'), waiter('ana-2', 'Ana'), waiter('ben', 'Ben')]);
		await render();

		expect(rows()[0].querySelector('.waiting-room-knock-time')?.textContent).toContain('10:42');
		expect(rows()[1].querySelector('.waiting-room-knock-time')).not.toBeNull();
		expect(rows()[2].querySelector('.waiting-room-knock-time')).toBeNull();
	});

	it('shows the free places under a limit only', async () => {
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		expect(find('#waiting-room-places-left')).toBeNull();

		availablePlaces.set(2);
		await render();

		expect(find('#waiting-room-places-left')?.textContent).toContain('"count":2');
	});

	it('admits and denies a row by its identity', async () => {
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		find('.waiting-room-admit-btn')!.click();
		await fixture.whenStable();
		find('.waiting-room-deny-btn')!.click();
		await fixture.whenStable();

		expect(waitingRoomAdmin.admit).toHaveBeenCalledOnceWith(['ana']);
		expect(waitingRoomAdmin.reject).toHaveBeenCalledOnceWith(['ana']);
	});

	it('offers the decisions on everyone from two waiting only', async () => {
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		expect(find('#waiting-room-bulk-actions')).toBeNull();

		waiting.set([waiter('ana', 'Ana'), waiter('ben', 'Ben'), waiter('zoe', 'Zoe')]);
		availablePlaces.set(2);
		await render();

		expect(find('#waiting-room-admit-shown-btn')?.textContent).toContain('"count":2');

		find('#waiting-room-admit-shown-btn')!.click();

		expect(waitingRoomAdmin.admitShown).toHaveBeenCalledTimes(1);
	});

	it('disables the admissions while no place is free', async () => {
		waiting.set([waiter('ana', 'Ana'), waiter('ben', 'Ben')]);
		availablePlaces.set(0);
		await render();

		expect((find('#waiting-room-admit-shown-btn') as HTMLButtonElement).disabled).toBeTrue();
		expect((find('.waiting-room-admit-btn') as HTMLButtonElement).disabled).toBeTrue();
		expect((find('.waiting-room-deny-btn') as HTMLButtonElement).disabled).toBeFalse();
	});

	it('denies everyone waiting once confirmed, naming nobody, and asks once', async () => {
		waiting.set([waiter('ana', 'Ana'), waiter('ben', 'Ben')]);
		await render();

		find('#waiting-room-deny-all-btn')!.click();

		expect(waitingRoomAdmin.reject).not.toHaveBeenCalled();

		const [options] = dialog.showDialog.calls.mostRecent().args as [DialogOptions];
		options.confirmCallback!();

		expect(waitingRoomAdmin.reject).toHaveBeenCalledOnceWith();
		expect(dialog.showDialog).toHaveBeenCalledTimes(1);
	});

	it('keeps the panel usable when a decision is refused', async () => {
		waitingRoomAdmin.admit.and.rejectWith(new Error('404'));
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		find('.waiting-room-admit-btn')!.click();
		await fixture.whenStable();
		await render();

		expect((find('.waiting-room-admit-btn') as HTMLButtonElement).disabled).toBeFalse();
	});
});
