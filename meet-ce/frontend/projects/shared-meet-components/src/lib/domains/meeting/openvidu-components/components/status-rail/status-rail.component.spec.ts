import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '../../../../../shared/services/i18n/translate.service';
import { MeetingContextService } from '../../../services/meeting-context.service';
import { HiddenParticipantsSummary } from '../../models/layout/smart-layout.model';
import { PanelType } from '../../models/panel.model';
import { RecordingState, RecordingStateInfo } from '../../models/recording.model';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';
import { SmartLayoutService } from '../../services/layout/smart-layout.service';
import { MeetingEndingSoonService } from '../../services/meeting-ending-soon/meeting-ending-soon.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { RecordingService } from '../../services/recording/recording.service';
import { StatusRailComponent } from './status-rail.component';

/**
 * The status rail keeps one clock slot and, for a phone, a menu that lists every status in full. The
 * phone row itself is a media query; what is checked here is what the rail and its menu hold.
 */
describe('StatusRailComponent', () => {
	let fixture: ComponentFixture<StatusRailComponent>;
	let meetingStartedAt: ReturnType<typeof signal<number | undefined>>;
	let remainingMs: ReturnType<typeof signal<number | undefined>>;
	let recordingStatus: ReturnType<typeof signal<RecordingStateInfo>>;
	let hiddenParticipants: ReturnType<typeof signal<HiddenParticipantsSummary | undefined>>;
	let e2eeKey: ReturnType<typeof signal<string>>;
	let raisedHands: ReturnType<typeof signal<{ identity: string }[]>>;
	let panelService: jasmine.SpyObj<PanelService>;

	beforeEach(async () => {
		meetingStartedAt = signal<number | undefined>(undefined);
		remainingMs = signal<number | undefined>(undefined);
		recordingStatus = signal<RecordingStateInfo>({ status: RecordingState.STOPPED });
		hiddenParticipants = signal<HiddenParticipantsSummary | undefined>(undefined);
		e2eeKey = signal('');
		raisedHands = signal<{ identity: string }[]>([]);
		panelService = jasmine.createSpyObj<PanelService>('PanelService', ['togglePanel', 'isActivitiesPanelOpened']);
		panelService.isActivitiesPanelOpened.and.returnValue(false);

		await TestBed.configureTestingModule({
			imports: [StatusRailComponent],
			providers: [
				provideZonelessChangeDetection(),
				{
					provide: TranslateService,
					useValue: { translate: (key: string) => key, translationsLoaded: signal(0) }
				},
				{ provide: MeetingContextService, useValue: { meetingStartedAt } },
				{ provide: MeetingEndingSoonService, useValue: { remainingMs } },
				{ provide: RecordingService, useValue: { recordingStatus } },
				{ provide: SmartLayoutService, useValue: { railHiddenParticipants: hiddenParticipants } },
				{
					provide: MeetingUiConfigService,
					useValue: {
						e2eeKeySignal: e2eeKey,
						activitiesPanelButtonSignal: signal(true),
						participantsPanelButtonSignal: signal(true)
					}
				},
				{ provide: PanelService, useValue: panelService },
				{ provide: ParticipantService, useValue: { raisedHands } }
			]
		}).compileComponents();

		fixture = TestBed.createComponent(StatusRailComponent);
	});

	async function render(): Promise<void> {
		fixture.detectChanges();
		await fixture.whenStable();
	}

	function find(selector: string): HTMLElement | null {
		return fixture.nativeElement.querySelector(selector);
	}

	async function openStatusMenu(): Promise<HTMLElement[]> {
		find('#status-rail-more')!.click();
		await render();
		return Array.from(document.querySelectorAll<HTMLElement>('.status-menu-item'));
	}

	it('takes no row while there is no status to show', async () => {
		await render();

		expect(find('#status-rail')).toBeNull();
		expect(fixture.nativeElement.classList).not.toContain('has-status');
	});

	it('shows the elapsed time, and nothing behind the menu, in a meeting with nothing else going on', async () => {
		meetingStartedAt.set(Date.now() - 65_000);
		await render();

		expect(fixture.nativeElement.classList).toContain('has-status');
		expect(find('#meeting-elapsed-time')?.textContent).toContain('0:01:0');
		expect(find('#status-rail-more')).toBeNull();
	});

	it('shows the countdown next to the elapsed time, which only a phone folds away', async () => {
		meetingStartedAt.set(Date.now() - 55 * 60_000);
		remainingMs.set(299_000);
		await render();

		expect(find('#meeting-ending-soon')?.textContent).toContain('4:59');
		expect(find('#meeting-elapsed-time')?.classList).toContain('folds');
		expect(find('#status-rail-more')).not.toBeNull();
	});

	it('lists every status in full behind the menu, the elapsed time included', async () => {
		const rowKinds = [
			'ending-soon-item',
			'elapsed-item',
			'recording-item',
			'e2ee-item',
			'raised-hands-item',
			'hidden-participants-item'
		];
		meetingStartedAt.set(Date.now() - 55 * 60_000 - 500);
		remainingMs.set(42_000);
		recordingStatus.set({ status: RecordingState.STARTED, elapsed: new Date(0, 0, 0, 0, 12, 5) });
		e2eeKey.set('secret');
		raisedHands.set([{ identity: 'sarah' }, { identity: 'lucia' }]);
		hiddenParticipants.set({ count: 4, names: ['Clara', 'Tom', 'Kenji', 'Ana'] });
		await render();

		const rows = await openStatusMenu();

		expect(rows.map((row) => rowKinds.find((kind) => row.classList.contains(kind)))).toEqual(rowKinds);
		expect(rows[0].textContent).toContain('0:42');
		expect(rows[1].textContent).toContain('0:55:0');
		expect(rows[2].textContent).toContain('0:12:05');
		expect(rows[4].textContent).toContain('2');
		expect(rows[5].textContent).toContain('+4');
		expect(rows[5].textContent).toContain('HIDDEN_PARTICIPANTS.NAMES_AND_MORE');
	});

	it('opens the participants panel from the hidden participants row', async () => {
		meetingStartedAt.set(Date.now());
		hiddenParticipants.set({ count: 1, names: ['Clara'] });
		await render();

		const rows = await openStatusMenu();
		rows.find((row) => row.classList.contains('hidden-participants-item'))!.click();

		expect(panelService.togglePanel).toHaveBeenCalledWith(PanelType.PARTICIPANTS);
	});
});
