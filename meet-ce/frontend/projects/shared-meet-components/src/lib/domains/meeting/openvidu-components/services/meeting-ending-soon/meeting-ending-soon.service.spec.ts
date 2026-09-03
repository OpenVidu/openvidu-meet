import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SoundService } from '../../../../../shared/services/sound.service';
import { MeetingEndingSoonService } from './meeting-ending-soon.service';

describe('MeetingEndingSoonService', () => {
	const NOTICE_WINDOW_MS = 5 * 60_000;

	let service: MeetingEndingSoonService;
	let soundService: jasmine.SpyObj<SoundService>;

	const deadlineIn = (ms: number) => Date.now() + ms;

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

	it('has nothing to show before a meeting is followed', () => {
		expect(service.remainingMs()).toBeUndefined();
		expect(service.noticeMinutes()).toBeUndefined();
	});

	describe('following the meeting deadline', () => {
		it('stays silent until the meeting enters the notice window', () => {
			service.watch(deadlineIn(NOTICE_WINDOW_MS + 60_000));

			expect(service.remainingMs()).toBeUndefined();

			jasmine.clock().tick(59_000);
			expect(service.remainingMs()).toBeUndefined();
			expect(soundService.playMeetingEndingSoonSound).not.toHaveBeenCalled();
		});

		it('announces the meeting exactly when the notice window opens', () => {
			service.watch(deadlineIn(NOTICE_WINDOW_MS + 60_000));

			jasmine.clock().tick(60_000);

			expect(service.remainingMs()).toBe(NOTICE_WINDOW_MS);
			expect(service.noticeMinutes()).toBe(5);
			expect(soundService.playMeetingEndingSoonSound).toHaveBeenCalledTimes(1);
		});

		it('announces at once a meeting already inside the notice window, as a late joiner finds it', () => {
			service.watch(deadlineIn(90_000));

			expect(service.remainingMs()).toBe(90_000);
			expect(service.noticeMinutes()).toBe(2);
			expect(soundService.playMeetingEndingSoonSound).toHaveBeenCalledTimes(1);
		});

		it('announces at once a meeting shorter than the whole notice window', () => {
			service.watch(deadlineIn(60_000));

			expect(service.remainingMs()).toBe(60_000);
			expect(service.noticeMinutes()).toBe(1);
		});

		it('ticks down once a second, against the clock rather than a fixed decrement', () => {
			service.watch(deadlineIn(10_000));

			jasmine.clock().tick(1_000);
			expect(service.remainingMs()).toBe(9_000);

			jasmine.clock().tick(4_000);
			expect(service.remainingMs()).toBe(5_000);
		});

		it('clamps at zero instead of going negative once the deadline passes', () => {
			service.watch(deadlineIn(2_000));

			jasmine.clock().tick(10_000);

			expect(service.remainingMs()).toBe(0);
		});

		it('ignores a deadline the meeting has already reached', () => {
			service.watch(deadlineIn(-1_000));

			expect(service.remainingMs()).toBeUndefined();
			expect(soundService.playMeetingEndingSoonSound).not.toHaveBeenCalled();
		});

		it('drops what the previous meeting left behind', () => {
			service.watch(deadlineIn(60_000));
			jasmine.clock().tick(10_000);
			expect(service.remainingMs()).toBe(50_000);

			// A second meeting, this one without a duration limit
			service.watch(undefined);

			expect(service.remainingMs()).toBeUndefined();
			expect(service.noticeMinutes()).toBeUndefined();

			jasmine.clock().tick(10_000);
			expect(service.remainingMs()).toBeUndefined();
		});
	});

	describe("falling back to the server's warning", () => {
		it('announces the meeting the warning reports', () => {
			service.warn(300_000);

			expect(service.remainingMs()).toBe(300_000);
			expect(service.noticeMinutes()).toBe(5);
			expect(soundService.playMeetingEndingSoonSound).toHaveBeenCalledTimes(1);
		});

		it('ticks down from the moment the warning arrived', () => {
			service.warn(10_000);

			jasmine.clock().tick(3_000);

			expect(service.remainingMs()).toBe(7_000);
		});

		it('is ignored while a deadline is being followed, so the meeting is announced once', () => {
			service.watch(deadlineIn(NOTICE_WINDOW_MS + 60_000));
			jasmine.clock().tick(60_000);
			expect(service.remainingMs()).toBe(NOTICE_WINDOW_MS);

			// The server's warning lands up to a sweep tick after the deadline it reports
			service.warn(4 * 60_000);

			expect(service.remainingMs()).toBe(NOTICE_WINDOW_MS);
			expect(soundService.playMeetingEndingSoonSound).toHaveBeenCalledTimes(1);
		});

		it('still announces a meeting whose deadline could not be read', () => {
			service.watch(undefined);

			service.warn(120_000);

			expect(service.remainingMs()).toBe(120_000);
		});
	});

	it('dismisses the notice on its own, leaving the countdown running', () => {
		service.watch(deadlineIn(120_000));
		expect(service.noticeMinutes()).toBe(2);

		jasmine.clock().tick(12_000);

		expect(service.noticeMinutes()).toBeUndefined();
		expect(service.remainingMs()).toBe(108_000);
	});
});
