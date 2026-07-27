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
		TestBed.inject(TemplateRegistryService).toolbar.set({} as never);
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
