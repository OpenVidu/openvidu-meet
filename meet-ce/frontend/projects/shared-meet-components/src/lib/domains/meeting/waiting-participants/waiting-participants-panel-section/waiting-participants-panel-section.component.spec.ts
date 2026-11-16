import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeetWaitingParticipantType } from '@openvidu-meet/typings';
import { DialogOptions } from '../../../../shared/models/notification.model';
import { DialogService } from '../../../../shared/services/dialog.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import { WaitingParticipantsAdminService, WaitingParticipantView } from '../waiting-participants-admin.service';
import { WaitingParticipantsPanelSectionComponent } from './waiting-participants-panel-section.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

const waiter = (identity: string, name: string, type = MeetWaitingParticipantType.USER): WaitingParticipantView => ({
	participant: { participantIdentity: identity, participantName: name, type, knockDate: 0 },
	name,
	knockedAt: new Date(2026, 10, 11, 10, 42).getTime(),
	color: 'hsl(40, 100%, 80%)'
});

describe('WaitingParticipantsPanelSectionComponent', () => {
	let fixture: ComponentFixture<WaitingParticipantsPanelSectionComponent>;
	let waiting: ReturnType<typeof signal<WaitingParticipantView[]>>;
	let freePlaces: ReturnType<typeof signal<number | null>>;
	let waitingAdmin: jasmine.SpyObj<WaitingParticipantsAdminService>;
	let dialog: jasmine.SpyObj<DialogService>;

	beforeEach(async () => {
		waiting = signal<WaitingParticipantView[]>([]);
		freePlaces = signal<number | null>(null);
		waitingAdmin = jasmine.createSpyObj<WaitingParticipantsAdminService>(
			'WaitingParticipantsAdminService',
			['admit', 'reject', 'admitAll', 'rejectAll'],
			{
				waiting,
				freePlaces,
				canAdmitAll: computed(() => {
					const places = freePlaces();
					return places === null || waiting().length <= places;
				})
			}
		);
		waitingAdmin.admit.and.resolveTo();
		waitingAdmin.reject.and.resolveTo();
		waitingAdmin.admitAll.and.resolveTo();
		waitingAdmin.rejectAll.and.resolveTo();
		dialog = jasmine.createSpyObj<DialogService>('DialogService', ['showDialog']);

		await TestBed.configureTestingModule({
			imports: [WaitingParticipantsPanelSectionComponent],
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: WaitingParticipantsAdminService, useValue: waitingAdmin },
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

		fixture = TestBed.createComponent(WaitingParticipantsPanelSectionComponent);
	});

	async function render(): Promise<void> {
		fixture.detectChanges();
		await fixture.whenStable();
	}

	const find = (selector: string): HTMLElement | null => fixture.nativeElement.querySelector(selector);
	const rows = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('.waiting-participants-row'));

	it('stays out of the panel while nobody waits', async () => {
		await render();

		expect(find('#waiting-participants-panel-section')).toBeNull();
	});

	it('lists those waiting in the order given, marking the rows of a shared link', async () => {
		waiting.set([waiter('ana', 'Ana', MeetWaitingParticipantType.ANONYMOUS), waiter('ben', 'Ben')]);
		await render();

		expect(rows().map((row) => row.dataset['participantIdentity'])).toEqual(['ana', 'ben']);
		expect(rows()[0].querySelector('.waiting-participants-shared-link')?.textContent).toContain(
			'WAITING_PARTICIPANTS.ADMIN.SHARED_LINK'
		);
		expect(rows()[1].querySelector('.waiting-participants-shared-link')).toBeNull();
	});

	it('shows each waiting participant with their avatar', async () => {
		waiting.set([waiter('ana', 'Ana'), waiter('ben', 'Ben')]);
		await render();

		expect(rows().map((row) => row.querySelector('.panel-initial')?.textContent?.trim())).toEqual(['A', 'B']);
	});

	it('shows when each asked to join next to a name two rows share', async () => {
		waiting.set([waiter('ana-1', 'Ana'), waiter('ana-2', 'Ana'), waiter('ben', 'Ben')]);
		await render();

		expect(rows()[0].querySelector('.waiting-participants-knock-time')?.textContent).toContain('10:42');
		expect(rows()[1].querySelector('.waiting-participants-knock-time')).not.toBeNull();
		expect(rows()[2].querySelector('.waiting-participants-knock-time')).toBeNull();
	});

	it('shows the free places under a limit only', async () => {
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		expect(find('#waiting-participants-places-left')).toBeNull();

		freePlaces.set(2);
		await render();

		expect(find('#waiting-participants-places-left')?.textContent).toContain('"count":2');
	});

	it('admits and denies a row by its identity', async () => {
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		find('.waiting-participants-admit-btn')!.click();
		await fixture.whenStable();
		find('.waiting-participants-deny-btn')!.click();
		await fixture.whenStable();

		expect(waitingAdmin.admit).toHaveBeenCalledOnceWith('ana');
		expect(waitingAdmin.reject).toHaveBeenCalledOnceWith('ana');
	});

	it('offers the decisions on everyone from two waiting only', async () => {
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		expect(find('#waiting-participants-bulk-actions')).toBeNull();

		waiting.set([waiter('ana', 'Ana'), waiter('ben', 'Ben')]);
		freePlaces.set(2);
		await render();

		expect(find('#waiting-participants-admit-all-btn')?.textContent).toContain(
			'WAITING_PARTICIPANTS.ADMIN.ADMIT_ALL'
		);

		find('#waiting-participants-admit-all-btn')!.click();

		expect(waitingAdmin.admitAll).toHaveBeenCalledTimes(1);
	});

	it('disables Admit all while more participants wait than places are free, leaving each row admittable', async () => {
		waiting.set([waiter('ana', 'Ana'), waiter('ben', 'Ben'), waiter('zoe', 'Zoe')]);
		freePlaces.set(2);
		await render();

		expect((find('#waiting-participants-admit-all-btn') as HTMLButtonElement).disabled).toBeTrue();
		expect((find('.waiting-participants-admit-btn') as HTMLButtonElement).disabled).toBeFalse();
	});

	it('disables the admissions while no place is free', async () => {
		waiting.set([waiter('ana', 'Ana'), waiter('ben', 'Ben')]);
		freePlaces.set(0);
		await render();

		expect((find('#waiting-participants-admit-all-btn') as HTMLButtonElement).disabled).toBeTrue();
		expect((find('.waiting-participants-admit-btn') as HTMLButtonElement).disabled).toBeTrue();
		expect((find('.waiting-participants-deny-btn') as HTMLButtonElement).disabled).toBeFalse();
	});

	it('denies everyone waiting once confirmed, and asks once', async () => {
		waiting.set([waiter('ana', 'Ana'), waiter('ben', 'Ben')]);
		await render();

		find('#waiting-participants-deny-all-btn')!.click();

		expect(waitingAdmin.rejectAll).not.toHaveBeenCalled();

		const [options] = dialog.showDialog.calls.mostRecent().args as [DialogOptions];
		options.confirmCallback!();

		expect(waitingAdmin.rejectAll).toHaveBeenCalledTimes(1);
		expect(dialog.showDialog).toHaveBeenCalledTimes(1);
	});

	it('keeps the panel usable when a decision is refused', async () => {
		waitingAdmin.admit.and.rejectWith(new Error('404'));
		waiting.set([waiter('ana', 'Ana')]);
		await render();

		find('.waiting-participants-admit-btn')!.click();
		await fixture.whenStable();
		await render();

		expect((find('.waiting-participants-admit-btn') as HTMLButtonElement).disabled).toBeFalse();
	});
});
