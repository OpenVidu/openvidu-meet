import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { MeetStorageService } from '../../../../../shared/services/storage.service';
import type { Participant } from '../livekit';
import { MeetingEventsService } from '../meeting-events/meeting-events.service';
import { ViewportService } from '../viewport/viewport.service';
import { SmartLayoutService } from './smart-layout.service';

const viewport = {
	isMobile: signal(false),
	isTablet: signal(false),
	orientation: computed(() => 'landscape'),
	isPortrait: () => false,
	viewportInfo: signal({ isPhysicalMobile: false, isPhysicalTablet: false })
};

describe('SmartLayoutService speaker ordering', () => {
	const activeSpeakers = signal<Participant[]>([]);
	const everyone = new Set(['alice', 'bob', 'carol']);
	let service: SmartLayoutService;
	let now = 0;

	/** One ActiveSpeakersChanged event from LiveKit, with the given participants speaking clearly. */
	const report = (...identities: string[]) => {
		activeSpeakers.set(
			identities.map((identity) => ({ identity, isLocal: identity === 'me', audioLevel: 0.5 }) as Participant)
		);
		TestBed.tick();
	};

	/** One event every 250 ms for `ms`, each with the same speakers. */
	const keepReporting = (ms: number, ...identities: string[]) => {
		for (let elapsed = 0; elapsed < ms; elapsed += 250) {
			now += 250;
			report(...identities);
		}
	};

	const shown = () => [...service.computeParticipantsToDisplay(everyone)];

	beforeEach(() => {
		now = 0;
		spyOn(Date, 'now').and.callFake(() => now);
		activeSpeakers.set([]);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useValue: { get: () => ({ d: () => {}, w: () => {}, e: () => {} }) } },
				{ provide: MeetingEventsService, useValue: { activeSpeakers } },
				{ provide: ViewportService, useValue: viewport },
				{
					provide: MeetStorageService,
					useValue: {
						getLayoutMode: () => null,
						getMaxVisibleRemoteParticipants: () => null,
						setLayoutMode: () => {},
						setMaxVisibleRemoteParticipants: () => {}
					}
				}
			]
		});

		service = TestBed.inject(SmartLayoutService);
		service.setMaxVisibleRemoteParticipants(1);
		TestBed.tick();
	});

	it('fills the grid with silent participants in the order they are given', () => {
		service.setMaxVisibleRemoteParticipants(2);

		expect(shown()).toEqual(['alice', 'bob']);
	});

	it('shows a speaker once they have spoken for two seconds, not before', () => {
		report('carol');
		keepReporting(1_750, 'carol');
		expect(shown()).toEqual(['alice']);

		keepReporting(250, 'carol');
		expect(shown()).toEqual(['carol']);
	});

	it('does not show a speaker for a one-second burst', () => {
		report('carol');
		keepReporting(1_000, 'carol');
		keepReporting(4_000);

		expect(shown()).toEqual(['alice']);
	});

	it('keeps showing a speaker who went quiet until someone else has spoken for two seconds', () => {
		report('carol');
		keepReporting(2_000, 'carol');

		keepReporting(10_000);
		expect(shown()).toEqual(['carol']);

		report('bob');
		keepReporting(2_000, 'bob');
		expect(shown()).toEqual(['bob']);
	});

	it('keeps the speaker already shown when another one starts at the only slot', () => {
		report('carol');
		keepReporting(2_000, 'carol');

		keepReporting(3_000, 'carol', 'bob');

		expect(shown()).toEqual(['carol']);
	});

	it('never gives a slot to the local participant', () => {
		report('me');
		keepReporting(3_000, 'me');

		expect(shown()).toEqual(['alice']);
	});
});
