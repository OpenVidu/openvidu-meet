import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetingShortcutsService } from '../services/meeting-shortcuts.service';
import { isMeetingKey, isShortcut } from './keyboard-shortcut.utils';

/**
 * Inside `<openvidu-meet>` the meeting's root is the element's shadow root, and the host page shares
 * the document with it: only keys pressed with the focus inside the element are the meeting's.
 */
describe('keyboard shortcuts', () => {
	let host: HTMLElement;
	let shadowRoot: ShadowRoot;

	const press = (target: HTMLElement, key: string, root: Node) => {
		let verdicts: { meetingKey: boolean; shortcut: boolean } | undefined;
		const listener = (event: Event) =>
			(verdicts = { meetingKey: isMeetingKey(event, root), shortcut: isShortcut(event, root) });
		document.addEventListener('keydown', listener);
		target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
		document.removeEventListener('keydown', listener);
		return verdicts!;
	};

	beforeEach(() => {
		host = document.body.appendChild(document.createElement('div'));
		shadowRoot = host.attachShadow({ mode: 'open' });
	});

	afterEach(() => host.remove());

	it('takes a key pressed inside the element', () => {
		const meetingButton = shadowRoot.appendChild(document.createElement('button'));

		expect(press(meetingButton, 'r', shadowRoot)).toEqual({ meetingKey: true, shortcut: true });
	});

	it('ignores a key pressed on the host page', () => {
		const hostButton = document.body.appendChild(document.createElement('button'));

		expect(press(hostButton, 'r', shadowRoot)).toEqual({ meetingKey: false, shortcut: false });
		hostButton.remove();
	});

	it('takes every key of the page when the meeting owns the document', () => {
		const button = document.body.appendChild(document.createElement('button'));

		expect(press(button, 'r', document)).toEqual({ meetingKey: true, shortcut: true });
		button.remove();
	});

	it('leaves keys typed in a text field to the field', () => {
		const input = shadowRoot.appendChild(document.createElement('input'));

		expect(press(input, 'r', shadowRoot)).toEqual({ meetingKey: true, shortcut: false });
	});

	// A compact toolbar keeps the hand and reaction buttons in its closed More options menu, out of the page.
	it('reads the root from the meeting, not from a button the toolbar took out of the page', () => {
		const meeting = shadowRoot.appendChild(document.createElement('div'));
		const meetingButton = shadowRoot.appendChild(document.createElement('button'));
		TestBed.configureTestingModule({
			providers: [MeetingShortcutsService, { provide: ElementRef, useValue: new ElementRef(meeting) }]
		});
		const shortcuts = TestBed.inject(MeetingShortcutsService);
		let verdict: boolean | undefined;
		const listener = (event: Event) => (verdict = shortcuts.isShortcut(event));
		document.addEventListener('keydown', listener);

		meetingButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true, composed: true }));
		expect(verdict).toBeTrue();

		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
		expect(verdict).toBeFalse();
		document.removeEventListener('keydown', listener);
	});
});
