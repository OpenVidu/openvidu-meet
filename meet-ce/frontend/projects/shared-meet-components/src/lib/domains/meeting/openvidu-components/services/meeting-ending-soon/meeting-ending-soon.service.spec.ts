import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetingEndingSoonService } from './meeting-ending-soon.service';

describe('MeetingEndingSoonService', () => {
	let service: MeetingEndingSoonService;

	beforeEach(() => {
		// mockDate is required too: without it, Date.now() keeps returning real wall-clock time
		// even while the fake timers are advanced by tick(), so the service's own elapsed-time
		// math would drift from the simulated clock.
		jasmine.clock().install();
		jasmine.clock().mockDate();

		TestBed.configureTestingModule({
			providers: [provideZonelessChangeDetection(), MeetingEndingSoonService]
		});

		service = TestBed.inject(MeetingEndingSoonService);
	});

	afterEach(() => {
		jasmine.clock().uninstall();
	});

	it('has no countdown before start is called', () => {
		expect(service.remainingMs()).toBeUndefined();
	});

	it('seeds the countdown with the exact value given', () => {
		service.start(300_000);

		expect(service.remainingMs()).toBe(300_000);
	});

	it('ticks down once a second, against the clock rather than a fixed decrement', () => {
		service.start(10_000);

		jasmine.clock().tick(1_000);
		expect(service.remainingMs()).toBe(9_000);

		jasmine.clock().tick(4_000);
		expect(service.remainingMs()).toBe(5_000);
	});

	it('clamps at zero instead of going negative once the deadline passes', () => {
		service.start(2_000);

		jasmine.clock().tick(10_000);

		expect(service.remainingMs()).toBe(0);
	});

	it('restarting replaces any countdown already running', () => {
		service.start(10_000);
		jasmine.clock().tick(3_000);
		expect(service.remainingMs()).toBe(7_000);

		service.start(20_000);

		expect(service.remainingMs()).toBe(20_000);
		jasmine.clock().tick(1_000);
		expect(service.remainingMs()).toBe(19_000);
	});
});
