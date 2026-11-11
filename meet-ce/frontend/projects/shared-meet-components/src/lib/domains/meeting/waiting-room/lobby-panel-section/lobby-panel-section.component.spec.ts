import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeetLobbyParticipantType } from '@openvidu-meet/typings';
import { DialogOptions } from '../../../../shared/models/notification.model';
import { DialogService } from '../../../../shared/services/dialog.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import { LobbyAdminService, LobbyWaiter } from '../lobby-admin.service';
import { LobbyPanelSectionComponent } from './lobby-panel-section.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

const waiter = (identity: string, name: string, type = MeetLobbyParticipantType.USER): LobbyWaiter => ({
	participant: { participantIdentity: identity, participantName: name, type, knockDate: 0 },
	name,
	knockedAt: new Date(2026, 10, 11, 10, 42).getTime()
});

describe('LobbyPanelSectionComponent', () => {
	let fixture: ComponentFixture<LobbyPanelSectionComponent>;
	let waiting: ReturnType<typeof signal<LobbyWaiter[]>>;
	let availablePlaces: ReturnType<typeof signal<number | null>>;
	let lobbyAdmin: jasmine.SpyObj<LobbyAdminService>;
	let dialog: jasmine.SpyObj<DialogService>;

	beforeEach(async () => {
		waiting = signal<LobbyWaiter[]>([]);
		availablePlaces = signal<number | null>(null);
		lobbyAdmin = jasmine.createSpyObj<LobbyAdminService>('LobbyAdminService', ['admit', 'reject', 'admitShown'], {
			waiting,
			availablePlaces,
			admittable: computed(() => {
				const places = availablePlaces();
				return places === null ? waiting().length : Math.min(places, waiting().length);
			})
		});
		lobbyAdmin.admit.and.resolveTo([]);
		lobbyAdmin.reject.and.resolveTo([]);
		lobbyAdmin.admitShown.and.resolveTo([]);
		dialog = jasmine.createSpyObj<DialogService>('DialogService', ['showDialog']);

		await TestBed.configureTestingModule({
			imports: [LobbyPanelSectionComponent],
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LobbyAdminService, useValue: lobbyAdmin },
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

		fixture = TestBed.createComponent(LobbyPanelSectionComponent);
	});

	async function render(): Promise<void> {
		fixture.detectChanges();
		await fixture.whenStable();
	}

	const find = (selector: string): HTMLElement | null => fixture.nativeElement.querySelector(selector);
	const rows = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('.lobby-row'));

	it('stays out of the panel while nobody waits', async () => {
		await render();

		expect(find('#lobby-panel-section')).toBeNull();
	});

	it('lists those waiting in arrival order, marking the rows of a shared link', async () => {
		waiting.set([waiter('ana', 'Ana', MeetLobbyParticipantType.ANONYMOUS), waiter('ben', 'Ben')]);
		await render();

		expect(rows().map((row) => row.dataset['participantIdentity'])).toEqual(['ana', 'ben']);
		expect(rows()[0].querySelector('.lobby-shared-link')?.textContent).toContain('WAITING_ROOM.ADMIN.SHARED_LINK');
		expect(rows()[1].querySelector('.lobby-shared-link')).toBeNull();
	});

	it('shows when each asked to join next to a name two rows share', async () => {
		waiting.set([waiter('ana-1', 'Ana'), waiter('ana-2', 'Ana'), waiter('ben', 'Ben')]);
		await render();

		expect(rows()[0].querySelector('.lobby-knock-time')?.textContent).toContain('10:42');
		expect(rows()[1].querySelector('.lobby-knock-time')).not.toBeNull();
		expect(rows()[2].querySelector('.lobby-knock-time')).toBeNull();
	});

	it('shows the free places under a limit only', async () => {
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		expect(find('#lobby-places-left')).toBeNull();

		availablePlaces.set(2);
		await render();

		expect(find('#lobby-places-left')?.textContent).toContain('"count":2');
	});

	it('admits and denies a row by its identity', async () => {
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		find('.lobby-admit-btn')!.click();
		await fixture.whenStable();
		find('.lobby-deny-btn')!.click();
		await fixture.whenStable();

		expect(lobbyAdmin.admit).toHaveBeenCalledOnceWith(['ana']);
		expect(lobbyAdmin.reject).toHaveBeenCalledOnceWith(['ana']);
	});

	it('offers the decisions on everyone from two waiting only', async () => {
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		expect(find('#lobby-bulk-actions')).toBeNull();

		waiting.set([waiter('ana', 'Ana'), waiter('ben', 'Ben'), waiter('zoe', 'Zoe')]);
		availablePlaces.set(2);
		await render();

		expect(find('#lobby-admit-shown-btn')?.textContent).toContain('"count":2');

		find('#lobby-admit-shown-btn')!.click();

		expect(lobbyAdmin.admitShown).toHaveBeenCalledTimes(1);
	});

	it('disables the admissions while no place is free', async () => {
		waiting.set([waiter('ana', 'Ana'), waiter('ben', 'Ben')]);
		availablePlaces.set(0);
		await render();

		expect((find('#lobby-admit-shown-btn') as HTMLButtonElement).disabled).toBeTrue();
		expect((find('.lobby-admit-btn') as HTMLButtonElement).disabled).toBeTrue();
		expect((find('.lobby-deny-btn') as HTMLButtonElement).disabled).toBeFalse();
	});

	it('denies everyone waiting once confirmed, naming nobody, and asks once', async () => {
		waiting.set([waiter('ana', 'Ana'), waiter('ben', 'Ben')]);
		await render();

		find('#lobby-deny-all-btn')!.click();

		expect(lobbyAdmin.reject).not.toHaveBeenCalled();

		const [options] = dialog.showDialog.calls.mostRecent().args as [DialogOptions];
		options.confirmCallback!();

		expect(lobbyAdmin.reject).toHaveBeenCalledOnceWith();
		expect(dialog.showDialog).toHaveBeenCalledTimes(1);
	});

	it('keeps the panel usable when a decision is refused', async () => {
		lobbyAdmin.admit.and.rejectWith(new Error('404'));
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		find('.lobby-admit-btn')!.click();
		await fixture.whenStable();
		await render();

		expect((find('.lobby-admit-btn') as HTMLButtonElement).disabled).toBeFalse();
	});
});
