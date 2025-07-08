import { describe, expect, it, jest } from '@jest/globals';
import { OpenViduMeet } from '../../src/components/OpenViduMeet';
import '../../src/index';

describe('OpenViduMeet WebComponent Attributes', () => {
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
		expect(iframe?.getAttribute('allow')).toContain('display-capture');
		expect(iframe?.getAttribute('allow')).toContain('fullscreen');
		expect(iframe?.getAttribute('allow')).toContain('autoplay');
		expect(iframe?.getAttribute('allow')).toContain('compute-pressure');
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
		const roomUrl = 'https://example.com/room/testRoom-123?secret=123456';
		component.setAttribute('room-url', roomUrl);
		component.setAttribute('user', 'testUser');

		// Manually trigger the update (MutationObserver doesn't always trigger in tests)
		(component as any).updateIframeSrc();

		const iframe = component.shadowRoot?.querySelector('iframe');
		expect(iframe?.src).toEqual(`${roomUrl}&user=testUser`);
	});

	it('should extract origin from room-url and set as allowed origin', () => {
		const domain = 'https://example.com';
		const roomUrl = `${domain}/room/testRoom-123?secret=123456`;
		component.setAttribute('room-url', roomUrl);

		// Trigger update
		(component as any).updateIframeSrc();

		// Check if origin was extracted and set
		expect((component as any).targetIframeOrigin).toBe(domain);
		expect((component as any).commandsManager.targetIframeOrigin).toBe(domain);
		expect((component as any).eventsManager.targetIframeOrigin).toBe(domain);
	});
});
