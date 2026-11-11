import { LiveAnnouncer } from '@angular/cdk/a11y';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssetsService } from '../../../../shared/services/assets.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { MeetingJoinService } from '../../services/meeting-join.service';
import { WaitingRoomOutcome, WaitingRoomService } from '../waiting-room.service';
import { ASK_AGAIN_PAUSE_AFTER_REJECTION_MS, WaitingOutcomeComponent } from './waiting-outcome.component';

describe('WaitingOutcomeComponent', () => {
	let fixture: ComponentFixture<WaitingOutcomeComponent>;
	let announce: jasmine.Spy;
	let askAgain: jasmine.Spy;
	let goBack: jasmine.Spy;
	const outcome = signal<WaitingRoomOutcome | undefined>(undefined);

	beforeEach(() => {
		jasmine.clock().install();
		announce = jasmine.createSpy('announce').and.resolveTo();
		askAgain = jasmine.createSpy('askAgain');
		goBack = jasmine.createSpy('goBack').and.resolveTo();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LiveAnnouncer, useValue: { announce } },
				{
					provide: TranslateService,
					useValue: { translate: (key: string) => key, translationsLoaded: () => 0 }
				},
				{ provide: AssetsService, useValue: { logo: 'logo.webp' } },
				{ provide: WaitingRoomService, useValue: { outcome, askAgain } },
				{
					provide: MeetingJoinService,
					useValue: { showBackButton: signal(true), backButtonText: signal('JOIN.BACK'), goBack }
				}
			]
		});
	});

	afterEach(() => {
		fixture?.destroy();
		jasmine.clock().uninstall();
	});

	async function show(how: WaitingRoomOutcome): Promise<HTMLElement> {
		outcome.set(how);
		fixture = TestBed.createComponent(WaitingOutcomeComponent);
		document.body.appendChild(fixture.nativeElement);
		fixture.detectChanges();
		await fixture.whenStable();
		return fixture.nativeElement as HTMLElement;
	}

	const askAgainButton = (element: HTMLElement) =>
		element.querySelector<HTMLButtonElement>('#waiting-outcome-ask-again-button')!;

	it('moves the focus to its heading and announces it assertively', async () => {
		const element = await show('rejected');
		const heading = element.querySelector('h1')!;

		expect(heading.textContent?.trim()).toBe('WAITING_ROOM.REJECTED_TITLE');
		expect(document.activeElement).toBe(heading);
		expect(announce).toHaveBeenCalledOnceWith('WAITING_ROOM.REJECTED_TITLE', 'assertive');
	});

	it('keeps asking again disabled for the 15 seconds after a rejection', async () => {
		const element = await show('rejected');
		expect(askAgainButton(element).disabled).toBeTrue();

		jasmine.clock().tick(ASK_AGAIN_PAUSE_AFTER_REJECTION_MS);
		await fixture.whenStable();

		expect(askAgainButton(element).disabled).toBeFalse();
	});

	it('lets the participant ask again at once after losing the place', async () => {
		const element = await show('expired');

		expect(element.querySelector('h1')!.textContent?.trim()).toBe('WAITING_ROOM.EXPIRED_TITLE');
		askAgainButton(element).click();

		expect(askAgain).toHaveBeenCalledTimes(1);
	});

	it('offers the dismiss button of the end screen', async () => {
		const element = await show('left');

		element.querySelector<HTMLButtonElement>('#waiting-outcome-back-button')!.click();

		expect(goBack).toHaveBeenCalledTimes(1);
	});
});
