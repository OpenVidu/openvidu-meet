import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OpenViduLayout, OpenViduLayoutOptions, VIEWPORT_LAYOUT_PROFILES } from '../../models/layout/layout.model';
import { ViewportService } from '../viewport/viewport.service';
import { BaseLayoutService } from './layout.service';

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
