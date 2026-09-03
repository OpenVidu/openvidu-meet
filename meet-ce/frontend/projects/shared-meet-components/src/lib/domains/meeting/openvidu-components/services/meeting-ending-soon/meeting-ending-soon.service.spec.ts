import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SoundService } from '../../../../../shared/services/sound.service';
import { MeetingEndingSoonService } from './meeting-ending-soon.service';

describe('MeetingEndingSoonService', () => {
	const NOTICE_WINDOW_MS = 5 * 60_000;

	let service: MeetingEndingSoonService;
	let soundService: jasmine.SpyObj<SoundService>;

	const endsIn = (ms: number) => Date.now() + ms;

	beforeEach(() => {
		// mockDate is required too: without it, Date.now() keeps returning real wall-clock time
		// even while the fake timers are advanced by tick(), so the service's own elapsed-time
		// math would drift from the simulated clock.
		jasmine.clock().install();
		jasmine.clock().mockDate();

		soundService = jasmine.createSpyObj<SoundService>('SoundService', ['playMeetingEndingSoonSound']);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingEndingSoonService,
				{ provide: SoundService, useValue: soundService }
			]
		});

		service = TestBed.inject(MeetingEndingSoonService);
	});

	afterEach(() => {
		jasmine.clock().uninstall();
	});

	it('has nothing to show before a meeting is tracked', () => {
		expect(service.remainingMs()).toBeUndefined();
		expect(service.noticeMinutes()).toBeUndefined();
	});

	describe("tracking the meeting's own end", () => {
		it('stays silent until the meeting enters the notice window', () => {
			service.trackMeetingEnd(endsIn(NOTICE_WINDOW_MS + 60_000));

			expect(service.remainingMs()).toBeUndefined();

			jasmine.clock().tick(59_000);
			expect(service.remainingMs()).toBeUndefined();
			expect(soundService.playMeetingEndingSoonSound).not.toHaveBeenCalled();
		});

		it('announces the meeting exactly when the notice window opens', () => {
			service.trackMeetingEnd(endsIn(NOTICE_WINDOW_MS + 60_000));

			jasmine.clock().tick(60_000);

			expect(service.remainingMs()).toBe(NOTICE_WINDOW_MS);
			expect(service.noticeMinutes()).toBe(5);
			expect(soundService.playMeetingEndingSoonSound).toHaveBeenCalledTimes(1);
		});

		it('announces at once a meeting already inside the notice window, as a late joiner finds it', () => {
			service.trackMeetingEnd(endsIn(90_000));

			expect(service.remainingMs()).toBe(90_000);
			expect(service.noticeMinutes()).toBe(2);
			expect(soundService.playMeetingEndingSoonSound).toHaveBeenCalledTimes(1);
		});

		it('announces at once a meeting shorter than the whole notice window', () => {
			service.trackMeetingEnd(endsIn(60_000));

			expect(service.remainingMs()).toBe(60_000);
			expect(service.noticeMinutes()).toBe(1);
		});

		it('ticks down once a second, against the clock rather than a fixed decrement', () => {
			service.trackMeetingEnd(endsIn(10_000));

			jasmine.clock().tick(1_000);
			expect(service.remainingMs()).toBe(9_000);

			jasmine.clock().tick(4_000);
			expect(service.remainingMs()).toBe(5_000);
		});

		it('clamps at zero instead of going negative once the deadline passes', () => {
			service.trackMeetingEnd(endsIn(2_000));

			jasmine.clock().tick(10_000);

			expect(service.remainingMs()).toBe(0);
		});

		it('ignores an end the meeting has already reached', () => {
			service.trackMeetingEnd(endsIn(-1_000));

			expect(service.remainingMs()).toBeUndefined();
			expect(soundService.playMeetingEndingSoonSound).not.toHaveBeenCalled();
		});

		it('drops what the previous meeting left behind', () => {
			service.trackMeetingEnd(endsIn(60_000));
			jasmine.clock().tick(10_000);
			expect(service.remainingMs()).toBe(50_000);

			// A second meeting, this one without a duration limit
			service.trackMeetingEnd(undefined);

			expect(service.remainingMs()).toBeUndefined();
			expect(service.noticeMinutes()).toBeUndefined();

			jasmine.clock().tick(10_000);
			expect(service.remainingMs()).toBeUndefined();
		});
	});

	it('dismisses the notice on its own, leaving the countdown running', () => {
		service.trackMeetingEnd(endsIn(120_000));
		expect(service.noticeMinutes()).toBe(2);

		jasmine.clock().tick(12_000);

		expect(service.noticeMinutes()).toBeUndefined();
		expect(service.remainingMs()).toBe(108_000);
	});
});
