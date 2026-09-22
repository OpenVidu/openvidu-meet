import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { DEFAULT_AVATAR_VIEW } from '../../models/avatar-view.model';
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

type SpiedTrack = Track & { attach: jasmine.Spy; detach: jasmine.Spy };

function trackOf(source: Track.Source, sid: string): SpiedTrack {
	return {
		source,
		sid,
		attach: jasmine.createSpy('attach'),
		detach: jasmine.createSpy('detach')
	} as unknown as SpiedTrack;
}

/**
 * What this component does with a track is decided by two things a gesture never touches: the
 * transform, which mirrors the local camera and moves a zoomed share, and the effect that puts the
 * media in the element and takes it out again. A stream that renders upside down, unmirrored or
 * blank is one of these.
 */
describe('VideoElementComponent video presentation', () => {
	let fixture: ComponentFixture<VideoElementComponent>;

	const render = (inputs: Record<string, unknown>): HTMLVideoElement => {
		for (const [name, value] of Object.entries(inputs)) {
			fixture.componentRef.setInput(name, value);
		}

		fixture.detectChanges();
		return fixture.nativeElement.querySelector('video');
	};

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [VideoElementComponent],
			providers: [provideZonelessChangeDetection(), { provide: ComponentFixtureAutoDetect, useValue: false }]
		}).compileComponents();

		fixture = TestBed.createComponent(VideoElementComponent);
	});

	it('renders no video and asks for no transform before a track arrives', () => {
		expect(render({})).toBeNull();
		expect(fixture.componentInstance.videoTransform()).toBe('none');
	});

	it('mirrors the local camera, and only the local one', () => {
		render({ videoTrack: trackOf(Track.Source.Camera, 'camera-1'), isLocal: true });

		expect(fixture.componentInstance.videoTransform()).toBe('scaleX(-1)');

		render({ isLocal: false });

		expect(fixture.componentInstance.videoTransform()).toBe('none');
	});

	it('leaves a screen share nobody has zoomed where it is', () => {
		render({ videoTrack: trackOf(Track.Source.ScreenShare, 'screen-1'), zoomState: new ScreenZoomState() });

		expect(fixture.componentInstance.videoTransform()).toBe('translate(0px, 0px) scale(1)');
		expect(fixture.componentInstance.isZoomable()).toBeFalse();
	});

	it('has nothing to apply to a screen share that carries no zoom state', () => {
		render({ videoTrack: trackOf(Track.Source.ScreenShare, 'screen-1') });

		expect(fixture.componentInstance.videoTransform()).toBe('none');
	});

	it('translates the normalized pan of a zoomed share into pixels of the rendered element', () => {
		const zoom = new ScreenZoomState();
		const video = render({ videoTrack: trackOf(Track.Source.ScreenShare, 'screen-1'), zoomState: zoom });
		video.style.width = '400px';
		video.style.height = '200px';

		zoom.setLevel(2);
		zoom.setPan(1, -1);

		// At 2x the video is twice the box, so half of it can move out of view on each axis.
		expect(fixture.componentInstance.videoTransform()).toBe('translate(200px, -100px) scale(2)');
		expect(fixture.componentInstance.isZoomable()).toBeTrue();
	});

	it('never offers panning on a camera, zoom state or not', () => {
		const zoom = new ScreenZoomState();
		zoom.setLevel(2);
		render({ videoTrack: trackOf(Track.Source.Camera, 'camera-1'), zoomState: zoom });

		expect(fixture.componentInstance.isZoomable()).toBeFalse();
	});

	it('fits a share inside the tile and fills the tile with a camera', () => {
		const share = render({ videoTrack: trackOf(Track.Source.ScreenShare, 'screen-1') });

		expect(share.style.objectFit).toBe('contain');
		expect(share.classList).toContain('screen-source');

		const camera = render({ videoTrack: trackOf(Track.Source.Camera, 'camera-1') });

		expect(camera.style.objectFit).toBe('cover');
		expect(camera.classList).toContain('camera-source');
	});

	it('attaches the track to the element it renders, and moves the element to the next track', () => {
		const first = trackOf(Track.Source.Camera, 'camera-1');
		const video = render({ videoTrack: first });

		expect(first.attach).toHaveBeenCalledWith(video);

		const second = trackOf(Track.Source.Camera, 'camera-2');
		const nextVideo = render({ videoTrack: second });

		expect(first.detach).toHaveBeenCalledWith(video);
		expect(second.attach).toHaveBeenCalledWith(nextVideo);
	});

	it('detaches the track when the tile goes away', () => {
		const track = trackOf(Track.Source.Camera, 'camera-1');
		const video = render({ videoTrack: track });

		fixture.destroy();

		expect(track.detach).toHaveBeenCalledWith(video);
	});

	// The frames of a stream this viewer cannot decrypt only ever decode to black, so the avatar's
	// encryption-error poster stands in for the video instead.
	it('mounts no video for a stream whose frames cannot be decrypted', () => {
		const track = trackOf(Track.Source.Camera, 'camera-1');

		expect(render({ videoTrack: track, avatar: { ...DEFAULT_AVATAR_VIEW, hasEncryptionError: true } })).toBeNull();
		expect(track.attach).not.toHaveBeenCalled();
	});
});
