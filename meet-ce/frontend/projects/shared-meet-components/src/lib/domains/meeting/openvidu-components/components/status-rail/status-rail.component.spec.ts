import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeetReaction } from '@openvidu-meet/typings';
import { TranslateService } from '../../../../../shared/services/i18n/translate.service';
import { MeetingContextService } from '../../../services/meeting-context.service';
import { MeetingReactionsService } from '../../../services/meeting-reactions.service';
import { HiddenParticipantsSummary } from '../../models/layout/smart-layout.model';
import { PanelType } from '../../models/panel.model';
import { ReactionCount } from '../../models/reaction.model';
import { RecordingState, RecordingStateInfo } from '../../models/recording.model';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';
import { SmartLayoutService } from '../../services/layout/smart-layout.service';
import { MeetingEndingSoonService } from '../../services/meeting-ending-soon/meeting-ending-soon.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { RecordingService } from '../../services/recording/recording.service';
import { StatusRailComponent } from './status-rail.component';

/**
 * The two rows of a phone are a media query; what is checked here is what the rail holds and when the
 * participants' row has anything to show.
 */
describe('StatusRailComponent', () => {
	let fixture: ComponentFixture<StatusRailComponent>;
	let meetingStartedAt: ReturnType<typeof signal<number | undefined>>;
	let remainingMs: ReturnType<typeof signal<number | undefined>>;
	let recordingStatus: ReturnType<typeof signal<RecordingStateInfo>>;
	let hiddenParticipants: ReturnType<typeof signal<HiddenParticipantsSummary | undefined>>;
	let e2eeKey: ReturnType<typeof signal<string>>;
	let raisedHands: ReturnType<typeof signal<{ identity: string }[]>>;
	let reactionCounts: ReturnType<typeof signal<ReactionCount[]>>;
	let panelService: jasmine.SpyObj<PanelService>;

	beforeEach(async () => {
		meetingStartedAt = signal<number | undefined>(undefined);
		remainingMs = signal<number | undefined>(undefined);
		recordingStatus = signal<RecordingStateInfo>({ status: RecordingState.STOPPED });
		hiddenParticipants = signal<HiddenParticipantsSummary | undefined>(undefined);
		e2eeKey = signal('');
		raisedHands = signal<{ identity: string }[]>([]);
		reactionCounts = signal<ReactionCount[]>([]);
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
				{ provide: ParticipantService, useValue: { raisedHands } },
				{ provide: MeetingReactionsService, useValue: { counts: reactionCounts } }
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

	function hasParticipantRow(): boolean {
		return fixture.nativeElement.classList.contains('has-participant-status');
	}

	it('takes no row while there is no status to show', async () => {
		await render();

		expect(find('#status-rail')).toBeNull();
		expect(fixture.nativeElement.classList).not.toContain('has-status');
	});

	it('shows the elapsed time alone in a meeting with nothing else going on', async () => {
		meetingStartedAt.set(Date.now() - 65_000);
		await render();

		expect(fixture.nativeElement.classList).toContain('has-status');
		expect(find('#meeting-elapsed-time')?.textContent).toContain('0:01:0');
		expect(hasParticipantRow()).toBeFalse();
	});

	it('shows the countdown next to the elapsed time, which only a phone folds away', async () => {
		meetingStartedAt.set(Date.now() - 55 * 60_000);
		remainingMs.set(299_000);
		await render();

		expect(find('#meeting-ending-soon')?.textContent).toContain('4:59');
		expect(find('#meeting-elapsed-time')?.classList).toContain('folds');
	});

	it('fills the participants row only while hands are raised, reactions shown or people left off the grid', async () => {
		meetingStartedAt.set(Date.now());
		remainingMs.set(42_000);
		recordingStatus.set({ status: RecordingState.STARTED, elapsed: new Date(0, 0, 0, 0, 12, 5) });
		e2eeKey.set('secret');
		await render();

		expect(find('#recording-tag')?.textContent).toContain('0:12:05');
		expect(hasParticipantRow()).toBeFalse();

		raisedHands.set([{ identity: 'sarah' }]);
		await render();
		expect(hasParticipantRow()).toBeTrue();

		raisedHands.set([]);
		reactionCounts.set([{ reaction: MeetReaction.THUMBS_UP, count: 1 }]);
		await render();
		expect(hasParticipantRow()).toBeTrue();

		reactionCounts.set([]);
		hiddenParticipants.set({ count: 1, names: ['Clara'] });
		await render();
		expect(hasParticipantRow()).toBeTrue();

		hiddenParticipants.set(undefined);
		await render();
		expect(hasParticipantRow()).toBeFalse();
	});

	it('shows the class pulse in the middle of the row, most shown reaction first', async () => {
		reactionCounts.set([
			{ reaction: MeetReaction.CONFUSED_FACE, count: 2 },
			{ reaction: MeetReaction.THUMBS_UP, count: 1 }
		]);
		await render();

		const rail = find('#status-rail')!;
		const pulse = find('#reaction-pulse')!;
		const entries = Array.from(pulse.querySelectorAll('.pulse-entry')).map((entry) =>
			entry.textContent!.replace(/\s+/g, '')
		);

		expect(Array.from(rail.children).indexOf(pulse)).toBe(1);
		expect(entries).toEqual(['😕2', '👍1']);
	});

	it('opens the participants panel from the class pulse', async () => {
		reactionCounts.set([{ reaction: MeetReaction.RED_HEART, count: 1 }]);
		await render();

		find('#reaction-pulse')!.click();

		expect(panelService.togglePanel).toHaveBeenCalledWith(PanelType.PARTICIPANTS);
	});

	it('opens the participants panel from the people left off the grid', async () => {
		meetingStartedAt.set(Date.now());
		hiddenParticipants.set({ count: 1, names: ['Clara'] });
		await render();

		find('ov-hidden-participants-indicator .unified-indicator')!.click();

		expect(panelService.togglePanel).toHaveBeenCalledWith(PanelType.PARTICIPANTS);
	});
});
