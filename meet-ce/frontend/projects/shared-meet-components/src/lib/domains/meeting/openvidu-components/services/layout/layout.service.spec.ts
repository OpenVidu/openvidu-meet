import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LayoutCalculator } from '../../models/layout/layout-calculator.model';
import { LayoutDimensionsCache } from '../../models/layout/layout-dimensions-cache.model';
import {
	ExtendedLayoutOptions,
	LAYOUT_CONSTANTS,
	LayoutBox,
	LayoutCalculationResult
} from '../../models/layout/layout-types.model';
import { OpenViduLayout, OpenViduLayoutOptions, VIEWPORT_LAYOUT_PROFILES } from '../../models/layout/layout.model';
import { ViewportService } from '../viewport/viewport.service';
import { BaseLayoutService } from './layout.service';

/** Boxes are floored to whole pixels row by row, so a clamp can be met with sub-pixel slack. */
const PIXEL_TOLERANCE = 0.01;

/** Height of the landscape camera every participant publishes, relative to its width. */
const CAMERA_RATIO = 9 / 16;

/**
 * Tile height above which livekit-client asks the SFU for the capture layer instead of 360p: the
 * element's box is the only input to that request, so a taller tile pulls a bigger layer for every
 * viewer of the grid.
 */
const CAPTURE_LAYER_BOUNDARY = 400;

/** Container the grid gets on each device: the window minus the toolbar and the status rail. */
const CONTAINERS = {
	desktop: { width: 1280, height: 650 },
	desktopWide: { width: 1856, height: 940 },
	// A maximised window on a 1920x1080 screen: wide enough that a 16:9 tile cannot span it.
	desktopShortWide: { width: 1886, height: 775 },
	tabletLandscape: { width: 1024, height: 646 },
	tabletPortrait: { width: 768, height: 902 },
	mobileLandscape: { width: 844, height: 320 },
	mobilePortrait: { width: 390, height: 730 }
};

class FakeViewportService {
	readonly width = signal(1280);
	readonly height = signal(650);
	readonly isMobile = signal(false);
	readonly isTablet = signal(false);
	readonly orientation = computed(() => (this.width() > this.height() ? 'landscape' : 'portrait'));
	readonly viewportInfo = computed(() => ({ width: this.width(), height: this.height() }));

	isPortrait(): boolean {
		return this.orientation() === 'portrait';
	}

	resize(width: number, height: number): void {
		this.width.set(width);
		this.height.set(height);
	}
}

class TestableLayoutService extends BaseLayoutService {
	override getOptions(): OpenViduLayoutOptions {
		return super.getOptions();
	}
}

const SHARED_SCREEN_RATIO = 1080 / 1920;

/** Width a `contain` shared screen is actually painted at inside a box. */
const paintedWidth = (box: { width: number; height: number }): number =>
	box.height / box.width > SHARED_SCREEN_RATIO ? box.width : box.height / SHARED_SCREEN_RATIO;

const cameras = (count: number): boolean[] => Array.from({ length: count }, () => false);

/** Share of a landscape camera that `object-fit: cover` cuts away to fill the tile. */
const croppedShare = (box: LayoutBox): number => {
	const ratio = box.height / box.width;

	return ratio > CAMERA_RATIO ? 1 - CAMERA_RATIO / ratio : 1 - ratio / CAMERA_RATIO;
};

describe('BaseLayoutService', () => {
	let viewport: FakeViewportService;
	let service: TestableLayoutService;
	let relayout: jasmine.Spy<OpenViduLayout['updateLayout']>;

	beforeEach(() => {
		viewport = new FakeViewportService();
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: ViewportService, useValue: viewport as unknown as ViewportService }
			]
		});
		relayout = spyOn(OpenViduLayout.prototype, 'updateLayout');
	});

	const startOnTablet = (width: number, height: number) => {
		viewport.isTablet.set(true);
		viewport.resize(width, height);
		service = TestBed.runInInjectionContext(() => new TestableLayoutService());
		service.initialize(document.createElement('div'));
		TestBed.tick();
		relayout.calls.reset();
	};

	it('lays the grid out again with the profile of the new orientation when the tablet rotates', () => {
		startOnTablet(768, 902);

		viewport.resize(1024, 646);
		TestBed.tick();

		expect(relayout).toHaveBeenCalledTimes(1);
		expect(relayout.calls.mostRecent().args[1].maxRatio).toBe(VIEWPORT_LAYOUT_PROFILES.tabletLandscape.maxRatio);
	});

	it('lets go of the container once cleared', () => {
		startOnTablet(1024, 646);

		service.clear();

		expect(service.layoutContainer).toBeUndefined();
	});

	it('does no work when the window resizes without leaving its profile', () => {
		startOnTablet(1024, 646);
		const readOptions = spyOn(service, 'getOptions').and.callThrough();

		for (const width of [1000, 980, 900]) {
			viewport.resize(width, 646);
			TestBed.tick();
		}

		expect(readOptions).not.toHaveBeenCalled();
		expect(relayout).not.toHaveBeenCalled();
	});
});

describe('BaseLayoutService viewport profiles', () => {
	let viewport: FakeViewportService;
	let service: TestableLayoutService;
	let calculator: LayoutCalculator;

	beforeEach(() => {
		viewport = new FakeViewportService();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: ViewportService, useValue: viewport as unknown as ViewportService }
			]
		});

		service = TestBed.runInInjectionContext(() => new TestableLayoutService());
		calculator = new LayoutCalculator(new LayoutDimensionsCache());
	});

	const on = (device: keyof typeof CONTAINERS): OpenViduLayoutOptions => {
		viewport.isMobile.set(device === 'mobileLandscape' || device === 'mobilePortrait');
		viewport.isTablet.set(device === 'tabletLandscape' || device === 'tabletPortrait');
		viewport.resize(CONTAINERS[device].width, CONTAINERS[device].height);

		return service.getOptions();
	};

	const layoutOn = (device: keyof typeof CONTAINERS, isBig: boolean[]): LayoutCalculationResult => {
		const extended: ExtendedLayoutOptions = {
			...on(device),
			containerWidth: CONTAINERS[device].width,
			containerHeight: CONTAINERS[device].height
		};

		return calculator.calculateLayout(extended, isBig, SHARED_SCREEN_RATIO);
	};

	const gridOn = (device: keyof typeof CONTAINERS, participants: number): LayoutBox[] =>
		layoutOn(device, cameras(participants)).boxes;

	const withSharedScreen = (device: keyof typeof CONTAINERS, participants: number) => {
		const { boxes, areas } = layoutOn(device, [true, ...cameras(participants)]);

		return { screen: boxes[0], screenArea: areas.big!, cameraBoxes: boxes.slice(1), band: areas.normal! };
	};

	describe('viewport profile', () => {
		it('caps landscape tiles at 4:3 so a camera is never cropped past a quarter', () => {
			expect(on('desktop').maxRatio).toBe(3 / 4);
			expect(on('desktopWide').maxRatio).toBe(3 / 4);
			expect(on('tabletLandscape').maxRatio).toBe(3 / 4);
		});

		it('keeps the taller caps the small portrait grids need', () => {
			expect(on('tabletPortrait').maxRatio).toBe(4 / 3);
			expect(on('mobilePortrait').maxRatio).toBe(5 / 4);
			expect(on('mobileLandscape').maxRatio).toBe(16 / 9);
		});

		it('leaves the shared screen free to keep the camera shape', () => {
			expect(on('desktop').bigMaxRatio).toBe(16 / 9);
			expect(on('tabletLandscape').bigMaxRatio).toBe(16 / 9);
		});

		it('carries the rest of the profile into the options', () => {
			expect(on('desktop').minRatio).toBe(9 / 16);
			expect(on('tabletLandscape').minRatio).toBe(2 / 3);
			expect(on('mobilePortrait').bigPercentage).toBe(0.85);
		});
	});

	describe('camera framing', () => {
		const landscapeDevices = ['desktop', 'desktopWide', 'tabletLandscape'] as const;

		it('never crops more than a quarter of a camera on a landscape grid', () => {
			for (const device of landscapeDevices) {
				for (let participants = 1; participants <= 12; participants++) {
					for (const box of gridOn(device, participants)) {
						expect(croppedShare(box)).toBeLessThanOrEqual(0.252);
					}
				}
			}
		});

		it('never makes a landscape tile taller than it is wide', () => {
			for (const device of landscapeDevices) {
				for (let participants = 1; participants <= 12; participants++) {
					for (const box of gridOn(device, participants)) {
						expect(box.height).toBeLessThanOrEqual(box.width + PIXEL_TOLERANCE);
					}
				}
			}
		});

		it('keeps every tile within the ratios of its own profile', () => {
			for (const device of Object.keys(CONTAINERS) as (keyof typeof CONTAINERS)[]) {
				const { minRatio, maxRatio } = on(device);

				for (let participants = 1; participants <= 12; participants++) {
					for (const box of gridOn(device, participants)) {
						const ratio = box.height / box.width;

						expect(ratio).toBeGreaterThanOrEqual(minRatio - PIXEL_TOLERANCE);
						expect(ratio).toBeLessThanOrEqual(maxRatio + PIXEL_TOLERANCE);
					}
				}
			}
		});

		it('lays three desktop participants out as two rows of full cameras', () => {
			const boxes = gridOn('desktop', 3);
			const rows = new Set(boxes.map((box) => Math.round(box.top)));

			expect(rows.size).toBe(2);
			expect(boxes[0].width).toBeCloseTo(578, 0);
			expect(boxes[0].height).toBeCloseTo(325, 0);
			expect(croppedShare(boxes[0])).toBeCloseTo(0, 2);
		});
	});

	describe('shared screen', () => {
		const devices = [
			'desktop',
			'desktopWide',
			'desktopShortWide',
			'tabletLandscape',
			'tabletPortrait',
			'mobilePortrait',
			'mobileLandscape'
		] as const;

		/** The cameras get a band that runs along the whole width of the container, or its whole height. */
		const isHorizontalBand = (band: LayoutBox, device: keyof typeof CONTAINERS): boolean =>
			band.width === CONTAINERS[device].width;

		it('keeps every camera within the ratios of its own profile', () => {
			for (const device of devices) {
				const { minRatio, maxRatio } = on(device);

				for (let participants = 1; participants <= 6; participants++) {
					for (const box of withSharedScreen(device, participants).cameraBoxes) {
						const ratio = box.height / box.width;

						expect(ratio).toBeGreaterThanOrEqual(minRatio - PIXEL_TOLERANCE);
						expect(ratio).toBeLessThanOrEqual(maxRatio + PIXEL_TOLERANCE);
					}
				}
			}
		});

		it('gives every camera beside it the same size', () => {
			for (const device of devices) {
				for (let participants = 1; participants <= 6; participants++) {
					const { cameraBoxes } = withSharedScreen(device, participants);
					const [first] = cameraBoxes;

					for (const box of cameraBoxes) {
						expect(box.width).toBeCloseTo(first.width, 5);
						expect(box.height).toBeCloseTo(first.height, 5);
					}
				}
			}
		});

		it('keeps the cameras big enough to make out a face', () => {
			for (const device of devices) {
				for (let participants = 1; participants <= 3; participants++) {
					for (const box of withSharedScreen(device, participants).cameraBoxes) {
						expect(box.height).toBeGreaterThan(120);
					}
				}
			}
		});

		it('leaves no gap between itself and the camera strip', () => {
			for (const device of devices) {
				for (let participants = 1; participants <= 3; participants++) {
					const { screen, screenArea, band } = withSharedScreen(device, participants);
					const split = isHorizontalBand(band, device)
						? screenArea.height - screen.height
						: screenArea.width - screen.width;

					expect(split).toBeLessThanOrEqual(2);
				}
			}
		});

		it('never gives the camera strip more than its cap on a desktop grid', () => {
			for (const device of ['desktop', 'desktopWide'] as const) {
				for (let participants = 1; participants <= 3; participants++) {
					const { band } = withSharedScreen(device, participants);

					expect(band.width).toBeLessThanOrEqual(LAYOUT_CONSTANTS.STRIP_MAX_SIZE + PIXEL_TOLERANCE);
				}
			}
		});

		it('takes the room the strip does not need on a wide monitor', () => {
			const container = CONTAINERS.desktopWide;

			for (let participants = 1; participants <= 3; participants++) {
				const { screenArea } = withSharedScreen('desktopWide', participants);

				expect(paintedWidth(screenArea) / paintedWidth(container)).toBeGreaterThan(0.95);
			}
		});
	});

	describe('simulcast layer the grid asks for', () => {
		it('stays below the capture layer from the third participant on a desktop grid', () => {
			for (let participants = 3; participants <= 12; participants++) {
				for (const box of gridOn('desktop', participants)) {
					expect(box.height).toBeLessThanOrEqual(CAPTURE_LAYER_BOUNDARY);
				}
			}
		});

		it('stays below the capture layer from the second participant on a tablet grid', () => {
			for (let participants = 2; participants <= 12; participants++) {
				for (const box of gridOn('tabletLandscape', participants)) {
					expect(box.height).toBeLessThanOrEqual(CAPTURE_LAYER_BOUNDARY);
				}
			}
		});

		it('still gives a one-to-one call the whole container', () => {
			const [box] = gridOn('desktop', 1);

			expect(box.height).toBeGreaterThan(CAPTURE_LAYER_BOUNDARY);
			expect(croppedShare(box)).toBeCloseTo(0, 2);
		});
	});
});
