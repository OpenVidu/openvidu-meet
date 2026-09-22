import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { SidenavMode } from '../../models/layout/layout.model';
import { PanelType } from '../../models/panel.model';
import { SmartLayoutService } from '../../services/layout/smart-layout.service';
import { PanelService } from '../../services/panel/panel.service';
import { TemplateRegistryService } from '../../services/template/template-registry.service';
import { RuntimeConfigService } from '../../../../../shared/services/runtime-config.service';
import { SidenavLayoutDirective } from './sidenav-layout.directive';

@Component({
	imports: [MatSidenavModule, SidenavLayoutDirective],
	template: `
		<mat-sidenav-container
			ovSidenavLayout
			#sidenavLayout="ovSidenavLayout"
			[style.width.px]="containerWidth()"
			[hasBackdrop]="sidenavLayout.hasBackdrop()"
		>
			<mat-sidenav [mode]="sidenavLayout.mode()" [class.big]="sidenavLayout.isSettingsPanelOpened()">
				panel
			</mat-sidenav>
			<mat-sidenav-content>content</mat-sidenav-content>
		</mat-sidenav-container>
	`
})
class HostComponent {
	readonly containerWidth = signal(1200);
	readonly sidenavLayout = viewChild.required(SidenavLayoutDirective);
	readonly sidenav = viewChild.required(MatSidenav);
}

describe('SidenavLayoutDirective', () => {
	let fixture: ComponentFixture<HostComponent>;
	let host: HostComponent;
	let panelService: PanelService;
	let layoutUpdateSpy: jasmine.Spy;

	/** Registering one skips the directive's own debounced layout pass (see the tests that call it). */
	const withToolbarTemplate = () => {
		TestBed.inject(TemplateRegistryService).toolbar.set({} as never);
	};

	const createFixture = () => {
		fixture = TestBed.createComponent(HostComponent);
		host = fixture.componentInstance;
		fixture.detectChanges();
	};

	beforeEach(() => {
		layoutUpdateSpy = jasmine.createSpy('update');

		TestBed.configureTestingModule({
			imports: [HostComponent],
			providers: [
				provideZonelessChangeDetection(),
				{ provide: SmartLayoutService, useValue: { update: layoutUpdateSpy } },
				{ provide: RuntimeConfigService, useValue: { isWebcomponentMode: () => false } }
			]
		});

		panelService = TestBed.inject(PanelService);
	});

	afterEach(() => {
		fixture?.destroy();
	});

	it('starts in SIDE mode and without backdrop', () => {
		createFixture();

		expect(host.sidenavLayout().mode()).toBe(SidenavMode.SIDE);
		expect(host.sidenavLayout().hasBackdrop()).toBeFalse();
	});

	it('opens and closes the sidenav following the panel state', () => {
		createFixture();

		panelService.togglePanel(PanelType.CHAT);
		fixture.detectChanges();
		expect(host.sidenav().opened).toBeTrue();

		panelService.closePanel();
		fixture.detectChanges();
		expect(host.sidenav().opened).toBeFalse();
	});

	it('syncs a panel that was already opened before the sidenav existed', () => {
		panelService.togglePanel(PanelType.PARTICIPANTS);
		createFixture();

		expect(host.sidenav().opened).toBeTrue();
	});

	it('reports the settings panel, which is the one that widens the sidenav', () => {
		createFixture();

		expect(host.sidenavLayout().isSettingsPanelOpened()).toBeFalse();

		panelService.togglePanel(PanelType.SETTINGS);
		fixture.detectChanges();
		expect(host.sidenavLayout().isSettingsPanelOpened()).toBeTrue();

		panelService.togglePanel(PanelType.CHAT);
		fixture.detectChanges();
		expect(host.sidenavLayout().isSettingsPanelOpened()).toBeFalse();
	});

	it('gives the container the full height when no toolbar template is registered', async () => {
		createFixture();

		const container: HTMLElement = fixture.nativeElement.querySelector('mat-sidenav-container');
		expect(container.style.height).toBe('100%');
		expect(container.style.minHeight).toBe('100%');

		await waitFor(() => layoutUpdateSpy.calls.any());
	});

	it('leaves the container height alone when a toolbar template is registered', () => {
		withToolbarTemplate();
		createFixture();

		const container: HTMLElement = fixture.nativeElement.querySelector('mat-sidenav-container');
		expect(container.style.height).toBe('');
	});

	it('recomputes the layout on window resize', () => {
		createFixture();
		layoutUpdateSpy.calls.reset();

		window.dispatchEvent(new Event('resize'));

		expect(layoutUpdateSpy).toHaveBeenCalled();
	});

	it('switches to OVER mode when the container gets narrower than the limit', async () => {
		createFixture();

		host.containerWidth.set(600);
		fixture.detectChanges();

		await waitFor(() => host.sidenavLayout().mode() === SidenavMode.OVER);
		expect(host.sidenavLayout().hasBackdrop()).toBeTrue();
	});

	// Material gives no width while the drawer animates, so the directive follows the transition on
	// a timer and stops when the drawer reports it arrived. Without that the grid keeps the size it
	// had before the panel opened.
	//
	// These tests register a toolbar template first: with none, the directive queues a layout pass
	// of its own on a 100ms debounce, and that pass would stand in for the ones under test here.
	it('recomputes the layout when the sidenav reports it opened or closed', async () => {
		withToolbarTemplate();
		createFixture();
		await fixture.whenStable();
		layoutUpdateSpy.calls.reset();

		// Material's openedChange is an async EventEmitter, so the pass lands on the next turn.
		host.sidenav().openedChange.emit(true);
		await waitFor(() => layoutUpdateSpy.calls.any());

		expect(layoutUpdateSpy).toHaveBeenCalledTimes(1);
	});

	// Switching to or from the settings panel is the width change with no event to follow: Material
	// re-measures it only while `autosize` is on, so the directive recomputes on a timer until its
	// cap rather than waiting for a report that never comes.
	it('recomputes the layout repeatedly while the sidenav changes width, then leaves it alone', async () => {
		withToolbarTemplate();
		createFixture();
		panelService.togglePanel(PanelType.CHAT);
		fixture.detectChanges();
		// The drawer reports it opened one turn later, which stops the passes of that opening.
		await delay(100);
		layoutUpdateSpy.calls.reset();

		panelService.togglePanel(PanelType.SETTINGS);
		fixture.detectChanges();

		await waitFor(() => layoutUpdateSpy.calls.count() >= 4);

		// Capped, so the passes stop on their own.
		await delay(900);
		const settled = layoutUpdateSpy.calls.count();
		await delay(200);

		expect(layoutUpdateSpy.calls.count()).toBe(settled);
	});

	it('stops listening for viewport changes once destroyed', () => {
		createFixture();
		fixture.destroy();
		layoutUpdateSpy.calls.reset();

		window.dispatchEvent(new Event('resize'));

		expect(layoutUpdateSpy).not.toHaveBeenCalled();
	});

	it('drops the layout pass it had queued when it is destroyed before running it', async () => {
		createFixture();
		layoutUpdateSpy.calls.reset();

		fixture.destroy();
		await delay(300);

		expect(layoutUpdateSpy).not.toHaveBeenCalled();
	});

	it('stops the passes that were still running when it was destroyed', async () => {
		withToolbarTemplate();
		createFixture();
		panelService.togglePanel(PanelType.CHAT);
		fixture.detectChanges();
		await delay(100);
		panelService.togglePanel(PanelType.SETTINGS);
		fixture.detectChanges();
		await waitFor(() => layoutUpdateSpy.calls.count() >= 4);

		fixture.destroy();
		layoutUpdateSpy.calls.reset();
		await delay(300);

		expect(layoutUpdateSpy).not.toHaveBeenCalled();
	});

	it('stops updating the layout once destroyed', async () => {
		createFixture();

		// Switching to/from SETTINGS starts the interval that follows the sidenav animation.
		panelService.togglePanel(PanelType.SETTINGS);
		fixture.detectChanges();
		panelService.togglePanel(PanelType.CHAT);
		fixture.detectChanges();
		await waitFor(() => layoutUpdateSpy.calls.any());

		fixture.destroy();
		layoutUpdateSpy.calls.reset();
		await delay(300);

		expect(layoutUpdateSpy).not.toHaveBeenCalled();
	});
});

/**
 * The suite runs zoneless, so there is no `fakeAsync`/`tick`: the timers and the ResizeObserver
 * deliver on real time. Poll instead of guessing a delay.
 */
async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
	const start = performance.now();

	while (!condition()) {
		if (performance.now() - start > timeoutMs) {
			throw new Error('Timed out waiting for condition');
		}

		await delay(20);
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
