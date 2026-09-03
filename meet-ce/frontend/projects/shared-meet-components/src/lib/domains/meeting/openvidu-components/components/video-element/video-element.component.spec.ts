import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { ScreenZoomState } from '../../models/screen-zoom.model';
import { Track } from '../../services/livekit';
import { VideoElementComponent } from './video-element.component';

function screenTrack(): Track {
	return {
		source: Track.Source.ScreenShare,
		sid: 'screen-1',
		attach: () => {},
		detach: () => {}
	} as unknown as Track;
}

/**
 * Pinch-to-zoom is only reachable with two simultaneous pointers, which neither the e2e suites nor a
 * device-less run can produce, so the gesture's arithmetic and its pointer bookkeeping are asserted
 * here against the real component.
 */
describe('VideoElementComponent screen-share gestures', () => {
	let fixture: ComponentFixture<VideoElementComponent>;
	let zoom: ScreenZoomState;
	let video: HTMLVideoElement;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [VideoElementComponent],
			providers: [provideZonelessChangeDetection(), { provide: ComponentFixtureAutoDetect, useValue: false }]
		}).compileComponents();

		fixture = TestBed.createComponent(VideoElementComponent);
		zoom = new ScreenZoomState();
		fixture.componentRef.setInput('videoTrack', screenTrack());
		fixture.componentRef.setInput('zoomState', zoom);
		fixture.detectChanges();

		video = fixture.nativeElement.querySelector('video');

		// Synthetic pointer ids were never really down, so the real capture calls would throw.
		Object.assign(video, { setPointerCapture: () => {}, releasePointerCapture: () => {} });
	});

	function pointer(type: string, pointerId: number, clientX: number, clientY: number): void {
		video.dispatchEvent(new PointerEvent(type, { pointerId, clientX, clientY, bubbles: true, cancelable: true }));
	}

	function pinch(from: number, to: number): void {
		pointer('pointerdown', 1, 0, 0);
		pointer('pointerdown', 2, from, 0);
		pointer('pointermove', 2, to, 0);
	}

	/** Lifts both fingers, so the next pinch is a fresh gesture rather than a move of this one. */
	function release(): void {
		pointer('pointerup', 2, 0, 0);
		pointer('pointerup', 1, 0, 0);
	}

	it('scales the zoom by the ratio the fingers moved apart', () => {
		pinch(100, 200);

		expect(zoom.level()).toBe(2);
	});

	it('pinching in zooms back out', () => {
		zoom.setLevel(2);

		pinch(200, 100);

		expect(zoom.level()).toBe(1);
	});

	it('clamps a spread beyond the maximum', () => {
		pinch(100, 1000);

		expect(zoom.level()).toBe(ScreenZoomState.MAX_LEVEL);
	});

	it('starts a pinch on an unzoomed share, where a single finger does nothing', () => {
		pointer('pointerdown', 1, 500, 500);
		pointer('pointermove', 1, 700, 500);

		expect(zoom.level()).toBe(ScreenZoomState.MIN_LEVEL);
		expect(fixture.componentInstance.isGesturing()).toBe(false);

		// The second finger measures against wherever the first one now is, not where it landed.
		pointer('pointerdown', 2, 800, 500);
		pointer('pointermove', 2, 900, 500);

		expect(zoom.level()).toBe(2);
	});

	it('ends the gesture when one finger lifts, without panning from the one still down', () => {
		pinch(100, 200);

		pointer('pointerup', 2, 200, 0);

		expect(fixture.componentInstance.isGesturing()).toBe(false);

		pointer('pointermove', 1, 999, 0);

		expect(zoom.level()).toBe(2);
		expect(zoom.pan()).toEqual({ x: 0, y: 0 });
	});

	it('forgets a lifted pointer, so the next single touch is not half a pinch', () => {
		pinch(100, 200);
		pointer('pointerup', 2, 200, 0);
		pointer('pointerup', 1, 0, 0);
		zoom.reset();

		pointer('pointerdown', 3, 50, 50);

		expect(fixture.componentInstance.isGesturing()).toBe(false);
		expect(zoom.level()).toBe(ScreenZoomState.MIN_LEVEL);
	});

	// The label interpolates `percent`, and a pinch lands between the buttons' 0.25 steps: the raw
	// level * 100 the label used to do renders 109.00000000000001 for a good fraction of those.
	it('reports a whole percentage at every level a pinch can reach', () => {
		for (let distance = 101; distance <= 400; distance += 1) {
			zoom.reset();
			pinch(100, distance);

			expect(Number.isInteger(zoom.percent))
				.withContext(`pinch to ${distance}px gave ${zoom.percent}`)
				.toBe(true);

			release();
		}

		zoom.reset();
		pinch(100, 137);

		expect(zoom.level()).toBeCloseTo(1.37, 5);
		expect(zoom.percent).toBe(137);
	});

	it('leaves a camera stream alone', () => {
		fixture.componentRef.setInput('videoTrack', {
			source: Track.Source.Camera,
			sid: 'cam-1',
			attach: () => {},
			detach: () => {}
		} as unknown as Track);
		fixture.detectChanges();

		pinch(100, 200);

		expect(zoom.level()).toBe(ScreenZoomState.MIN_LEVEL);
	});
});
