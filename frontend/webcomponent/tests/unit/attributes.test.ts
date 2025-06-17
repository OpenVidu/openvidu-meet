import { describe, it, expect, jest } from '@jest/globals';
import { WEBCOMPONENT_ROOM_URL } from '../config';
import { OpenViduMeet } from '../../src/components/OpenViduMeet';
import '../../src/index';

describe('Web Component Attributes', () => {
	let component: OpenViduMeet;

	beforeEach(() => {
		component = document.createElement('openvidu-meet') as OpenViduMeet;
		document.body.appendChild(component);
	});

	afterEach(() => {
		document.body.removeChild(component);
		document.body.innerHTML = '';
	});

	it('should render iframe with correct attributes', () => {
		const iframe = component.shadowRoot?.querySelector('iframe');
		expect(iframe).not.toBeNull();
		expect(iframe?.getAttribute('allow')).toContain('camera');
		expect(iframe?.getAttribute('allow')).toContain('microphone');
		expect(iframe?.getAttribute('allow')).toContain('fullscreen');
		expect(iframe?.getAttribute('allow')).toContain('display-capture');
	});

	it('should reject rendering iframe when "room-url" attribute is missing', () => {
		const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

		// Trigger updateIframeSrc manually
		(component as any).updateIframeSrc();

		const iframe = component.shadowRoot?.querySelector('iframe');

		expect(iframe).toBeDefined();
		expect(iframe?.src).toBeFalsy();
		expect(consoleErrorSpy).toHaveBeenCalledWith('The "room-url" or "recording-url" attribute is required.');

		consoleErrorSpy.mockRestore();
	});

	it('should update iframe src when "room-url" attribute changes', () => {
		component.setAttribute('room-url', WEBCOMPONENT_ROOM_URL);
		component.setAttribute('user', 'testUser');

		// Manually trigger the update (MutationObserver doesn't always trigger in tests)
		(component as any).updateIframeSrc();

		const iframe = component.shadowRoot?.querySelector('iframe');
		expect(iframe?.src).toEqual(`${WEBCOMPONENT_ROOM_URL}?user=testUser`);
	});

	it('should extract origin from room-url and set as allowed origin', () => {
		const roomUrl = 'https://example.com/room/123';
		component.setAttribute('room-url', roomUrl);

		// Trigger update
		(component as any).updateIframeSrc();

		// Check if origin was extracted and set
		expect((component as any).targetIframeOrigin).toBe('https://example.com');
		expect((component as any).commandsManager.targetIframeOrigin).toBe('https://example.com');
	});
});
