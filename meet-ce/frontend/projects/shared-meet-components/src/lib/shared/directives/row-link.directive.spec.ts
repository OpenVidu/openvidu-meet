import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RowLinkDirective } from './row-link.directive';

@Component({
	imports: [RowLinkDirective],
	template: `
		<div id="row" [ovRowLink]="['/rooms', 'room-1']">
			<span id="cell">Room 1</span>
			<button id="action">Delete</button>
		</div>
	`
})
class HostComponent {}

describe('RowLinkDirective', () => {
	let fixture: ComponentFixture<HostComponent>;
	let navigateSpy: jasmine.Spy;
	let openSpy: jasmine.Spy;

	const element = (id: string): HTMLElement => fixture.nativeElement.querySelector(`#${id}`);

	const dispatch = (id: string, type: string, init: MouseEventInit = {}): MouseEvent => {
		const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
		element(id).dispatchEvent(event);
		return event;
	};

	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [HostComponent],
			providers: [provideZonelessChangeDetection(), provideRouter([])]
		});
		navigateSpy = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		openSpy = spyOn(window, 'open');
		fixture = TestBed.createComponent(HostComponent);
		fixture.detectChanges();
	});

	it('opens the page in the same tab on a click', () => {
		dispatch('cell', 'click');

		expect(navigateSpy).toHaveBeenCalledOnceWith(['/rooms', 'room-1']);
		expect(openSpy).not.toHaveBeenCalled();
	});

	it('opens the page in a new tab on a click with Ctrl', () => {
		dispatch('cell', 'click', { ctrlKey: true });

		expect(openSpy).toHaveBeenCalledOnceWith(jasmine.stringMatching(/\/rooms\/room-1$/), '_blank');
		expect(navigateSpy).not.toHaveBeenCalled();
	});

	it('opens the page in a new tab on a middle click and keeps the browser from scrolling', () => {
		const mousedown = dispatch('cell', 'mousedown', { button: 1 });
		dispatch('cell', 'auxclick', { button: 1 });

		expect(mousedown.defaultPrevented).toBeTrue();
		expect(openSpy).toHaveBeenCalledOnceWith(jasmine.stringMatching(/\/rooms\/room-1$/), '_blank');
		expect(navigateSpy).not.toHaveBeenCalled();
	});

	it('ignores a right click', () => {
		const mousedown = dispatch('cell', 'mousedown', { button: 2 });
		dispatch('cell', 'auxclick', { button: 2 });

		expect(mousedown.defaultPrevented).toBeFalse();
		expect(openSpy).not.toHaveBeenCalled();
	});

	it('leaves a click or a middle click on a button to the button', () => {
		dispatch('action', 'click');
		const mousedown = dispatch('action', 'mousedown', { button: 1 });
		dispatch('action', 'auxclick', { button: 1 });

		expect(mousedown.defaultPrevented).toBeFalse();
		expect(navigateSpy).not.toHaveBeenCalled();
		expect(openSpy).not.toHaveBeenCalled();
	});
});
