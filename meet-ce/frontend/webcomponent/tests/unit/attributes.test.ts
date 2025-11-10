import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OpenViduMeet } from '../../src/components/OpenViduMeet';
import { WebComponentProperty } from '@openvidu-meet/typings';
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

	// ==========================================
	// IFRAME SETUP
	// ==========================================
	describe('Iframe Configuration', () => {
		it('should render iframe with correct media permissions', () => {
			const iframe = component.shadowRoot?.querySelector('iframe');
			expect(iframe).not.toBeNull();

			const allowAttribute = iframe?.getAttribute('allow');
			expect(allowAttribute).toContain('camera');
			expect(allowAttribute).toContain('microphone');
			expect(allowAttribute).toContain('display-capture');
			expect(allowAttribute).toContain('fullscreen');
			expect(allowAttribute).toContain('autoplay');
			expect(allowAttribute).toContain('compute-pressure');
		});

		it('should have iframe ready in shadow DOM', () => {
			const iframe = component.shadowRoot?.querySelector('iframe');
			expect(iframe).toBeInstanceOf(HTMLIFrameElement);
		});
	});

	// ==========================================
	// REQUIRED ATTRIBUTES (room-url | recording-url)
	// ==========================================
	describe('Required Attributes', () => {
		it('should reject iframe src when both room-url and recording-url are missing', () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			// Trigger updateIframeSrc manually
			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');

			expect(iframe).toBeDefined();
			expect(iframe?.src).toBeFalsy();
			expect(consoleErrorSpy).toHaveBeenCalledWith('The "room-url" or "recording-url" attribute is required.');

			consoleErrorSpy.mockRestore();
		});

		it('should set iframe src when room-url attribute is provided', () => {
			const roomUrl = 'https://example.com/room/testRoom-123';
			component.setAttribute(WebComponentProperty.ROOM_URL, roomUrl);

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			expect(iframe?.src).toBe(roomUrl);
		});

		it('should set iframe src when recording-url attribute is provided', () => {
			const recordingUrl = 'https://example.com/recordings/recording-abc-123';
			component.setAttribute(WebComponentProperty.RECORDING_URL, recordingUrl);

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			expect(iframe?.src).toBe(recordingUrl);
		});

		it('should prefer room-url over recording-url when both are provided', () => {
			const roomUrl = 'https://example.com/room/testRoom-123';
			const recordingUrl = 'https://example.com/recordings/recording-abc-123';

			component.setAttribute(WebComponentProperty.ROOM_URL, roomUrl);
			component.setAttribute(WebComponentProperty.RECORDING_URL, recordingUrl);

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			expect(iframe?.src).toBe(roomUrl);
		});

		it('should extract origin from room-url and set as target origin', () => {
			const domain = 'https://example.com';
			const roomUrl = `${domain}/room/testRoom-123?secret=123456`;
			component.setAttribute(WebComponentProperty.ROOM_URL, roomUrl);

			(component as any).updateIframeSrc();

			expect((component as any).targetIframeOrigin).toBe(domain);
			expect((component as any).commandsManager.targetIframeOrigin).toBe(domain);
			expect((component as any).eventsManager.targetIframeOrigin).toBe(domain);
		});

		it('should extract origin from recording-url and set as target origin', () => {
			const domain = 'https://recordings.example.com';
			const recordingUrl = `${domain}/recordings/recording-abc-123`;
			component.setAttribute(WebComponentProperty.RECORDING_URL, recordingUrl);

			(component as any).updateIframeSrc();

			expect((component as any).targetIframeOrigin).toBe(domain);
			expect((component as any).commandsManager.targetIframeOrigin).toBe(domain);
			expect((component as any).eventsManager.targetIframeOrigin).toBe(domain);
		});

		it('should update iframe src when room-url attribute changes', () => {
			const roomUrl1 = 'https://example.com/room/room-1';
			const roomUrl2 = 'https://example.com/room/room-2';

			component.setAttribute(WebComponentProperty.ROOM_URL, roomUrl1);
			(component as any).updateIframeSrc();

			let iframe = component.shadowRoot?.querySelector('iframe');
			expect(iframe?.src).toBe(roomUrl1);

			component.setAttribute(WebComponentProperty.ROOM_URL, roomUrl2);
			(component as any).updateIframeSrc();

			iframe = component.shadowRoot?.querySelector('iframe');
			expect(iframe?.src).toBe(roomUrl2);
		});
	});

	// ==========================================
	// OPTIONAL ATTRIBUTES AS QUERY PARAMETERS
	// ==========================================
	describe('Optional Attributes as Query Parameters', () => {
		const baseRoomUrl = 'https://example.com/room/testRoom';

		it('should add participant-name as query parameter', () => {
			const participantName = 'John Doe';
			component.setAttribute(WebComponentProperty.ROOM_URL, baseRoomUrl);
			component.setAttribute(WebComponentProperty.PARTICIPANT_NAME, participantName);

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');
			expect(url.searchParams.get(WebComponentProperty.PARTICIPANT_NAME)).toBe(participantName);
		});

		it('should add e2ee-key as query parameter', () => {
			const e2eeKey = 'secret-encryption-key-123';
			component.setAttribute(WebComponentProperty.ROOM_URL, baseRoomUrl);
			component.setAttribute(WebComponentProperty.E2EE_KEY, e2eeKey);

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');
			expect(url.searchParams.get(WebComponentProperty.E2EE_KEY)).toBe(e2eeKey);
		});

		it('should add leave-redirect-url as query parameter', () => {
			const redirectUrl = 'https://example.com/goodbye';
			component.setAttribute(WebComponentProperty.ROOM_URL, baseRoomUrl);
			component.setAttribute(WebComponentProperty.LEAVE_REDIRECT_URL, redirectUrl);

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');
			expect(url.searchParams.get(WebComponentProperty.LEAVE_REDIRECT_URL)).toBe(redirectUrl);
		});

		it('should add show-only-recordings as query parameter', () => {
			component.setAttribute(WebComponentProperty.ROOM_URL, baseRoomUrl);
			component.setAttribute(WebComponentProperty.SHOW_ONLY_RECORDINGS, 'true');

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');
			expect(url.searchParams.get(WebComponentProperty.SHOW_ONLY_RECORDINGS)).toBe('true');
		});

		it('should add multiple optional attributes as query parameters', () => {
			const participantName = 'Jane Smith';
			const e2eeKey = 'encryption-key-456';
			const redirectUrl = 'https://example.com/thanks';

			component.setAttribute(WebComponentProperty.ROOM_URL, baseRoomUrl);
			component.setAttribute(WebComponentProperty.PARTICIPANT_NAME, participantName);
			component.setAttribute(WebComponentProperty.E2EE_KEY, e2eeKey);
			component.setAttribute(WebComponentProperty.LEAVE_REDIRECT_URL, redirectUrl);
			component.setAttribute(WebComponentProperty.SHOW_ONLY_RECORDINGS, 'false');

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');

			expect(url.searchParams.get(WebComponentProperty.PARTICIPANT_NAME)).toBe(participantName);
			expect(url.searchParams.get(WebComponentProperty.E2EE_KEY)).toBe(e2eeKey);
			expect(url.searchParams.get(WebComponentProperty.LEAVE_REDIRECT_URL)).toBe(redirectUrl);
			expect(url.searchParams.get(WebComponentProperty.SHOW_ONLY_RECORDINGS)).toBe('false');
		});

		it('should NOT add room-url or recording-url as query parameters', () => {
			const roomUrl = 'https://example.com/room/testRoom?secret=abc';
			component.setAttribute(WebComponentProperty.ROOM_URL, roomUrl);

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');

			// room-url should not be in query params (it's the base URL)
			expect(url.searchParams.has(WebComponentProperty.ROOM_URL)).toBe(false);
			expect(url.searchParams.has(WebComponentProperty.RECORDING_URL)).toBe(false);
		});

		it('should preserve existing query parameters in room-url', () => {
			const roomUrl = 'https://example.com/room/testRoom?secret=abc123&role=moderator';
			const participantName = 'Alice';

			component.setAttribute(WebComponentProperty.ROOM_URL, roomUrl);
			component.setAttribute(WebComponentProperty.PARTICIPANT_NAME, participantName);

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');

			// Original query params should be preserved
			expect(url.searchParams.get('secret')).toBe('abc123');
			expect(url.searchParams.get('role')).toBe('moderator');
			// New param should be added
			expect(url.searchParams.get(WebComponentProperty.PARTICIPANT_NAME)).toBe(participantName);
		});
	});

	// ==========================================
	// CUSTOM/UNKNOWN ATTRIBUTES
	// ==========================================
	describe('Custom Attributes as Query Parameters', () => {
		it('should add custom attributes as query parameters', () => {
			const baseRoomUrl = 'https://example.com/room/testRoom';
			component.setAttribute(WebComponentProperty.ROOM_URL, baseRoomUrl);
			component.setAttribute('custom-attr', 'custom-value');
			component.setAttribute('another-param', 'another-value');

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');

			expect(url.searchParams.get('custom-attr')).toBe('custom-value');
			expect(url.searchParams.get('another-param')).toBe('another-value');
		});

		it('should handle attribute names with special characters', () => {
			const baseRoomUrl = 'https://example.com/room/testRoom';
			component.setAttribute(WebComponentProperty.ROOM_URL, baseRoomUrl);
			component.setAttribute('data-test-id', '12345');

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');

			expect(url.searchParams.get('data-test-id')).toBe('12345');
		});
	});

	// ==========================================
	// EDGE CASES
	// ==========================================
	describe('Edge Cases', () => {
		it('should handle empty string attributes', () => {
			const baseRoomUrl = 'https://example.com/room/testRoom';
			component.setAttribute(WebComponentProperty.ROOM_URL, baseRoomUrl);
			component.setAttribute(WebComponentProperty.PARTICIPANT_NAME, '');

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');

			// Empty string should still be added as query param
			expect(url.searchParams.has(WebComponentProperty.PARTICIPANT_NAME)).toBe(true);
			expect(url.searchParams.get(WebComponentProperty.PARTICIPANT_NAME)).toBe('');
		});

		it('should handle special characters in attribute values', () => {
			const baseRoomUrl = 'https://example.com/room/testRoom';
			const specialName = 'User Name With Spaces & Special=Chars';
			component.setAttribute(WebComponentProperty.ROOM_URL, baseRoomUrl);
			component.setAttribute(WebComponentProperty.PARTICIPANT_NAME, specialName);

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');

			// Should be URL-encoded properly
			expect(url.searchParams.get(WebComponentProperty.PARTICIPANT_NAME)).toBe(specialName);
		});

		it('should handle updating attributes after initial render', () => {
			const baseRoomUrl = 'https://example.com/room/testRoom';
			component.setAttribute(WebComponentProperty.ROOM_URL, baseRoomUrl);
			(component as any).updateIframeSrc();

			const initialSrc = component.shadowRoot?.querySelector('iframe')?.src;

			// Update an attribute
			component.setAttribute(WebComponentProperty.PARTICIPANT_NAME, 'Updated Name');
			(component as any).updateIframeSrc();

			const updatedSrc = component.shadowRoot?.querySelector('iframe')?.src;

			expect(initialSrc).not.toBe(updatedSrc);

			const url = new URL(updatedSrc || '');
			expect(url.searchParams.get(WebComponentProperty.PARTICIPANT_NAME)).toBe('Updated Name');
		});

		it('should handle invalid URL gracefully', () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			// Set an invalid URL
			component.setAttribute(WebComponentProperty.ROOM_URL, 'not-a-valid-url');

			// Call updateIframeSrc directly - it should catch the error and log it
			(component as any).updateIframeSrc();

			// Verify error was logged with the invalid URL
			expect(consoleErrorSpy).toHaveBeenCalledWith('Invalid URL provided: not-a-valid-url', expect.anything());

			consoleErrorSpy.mockRestore();
		});
	});

	// ==========================================
	// INTEGRATION TESTS
	// ==========================================
	describe('Integration Tests', () => {
		it('should handle complete real-world scenario with room-url and multiple attributes', () => {
			const roomUrl = 'https://meet.example.com/room/team-standup?secret=xyz789';
			const participantName = 'John Doe';
			const e2eeKey = 'my-secure-key';
			const redirectUrl = 'https://example.com/dashboard';

			component.setAttribute(WebComponentProperty.ROOM_URL, roomUrl);
			component.setAttribute(WebComponentProperty.PARTICIPANT_NAME, participantName);
			component.setAttribute(WebComponentProperty.E2EE_KEY, e2eeKey);
			component.setAttribute(WebComponentProperty.LEAVE_REDIRECT_URL, redirectUrl);

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');

			// Verify base URL
			expect(url.origin).toBe('https://meet.example.com');
			expect(url.pathname).toBe('/room/team-standup');

			// Verify all query parameters
			expect(url.searchParams.get('secret')).toBe('xyz789');
			expect(url.searchParams.get(WebComponentProperty.PARTICIPANT_NAME)).toBe(participantName);
			expect(url.searchParams.get(WebComponentProperty.E2EE_KEY)).toBe(e2eeKey);
			expect(url.searchParams.get(WebComponentProperty.LEAVE_REDIRECT_URL)).toBe(redirectUrl);

			// Verify origin was set correctly
			expect((component as any).targetIframeOrigin).toBe('https://meet.example.com');
		});

		it('should handle complete real-world scenario with recording-url', () => {
			const recordingUrl = 'https://recordings.example.com/view/rec-20231115-abc123';
			const participantName = 'Viewer';

			component.setAttribute(WebComponentProperty.RECORDING_URL, recordingUrl);
			component.setAttribute(WebComponentProperty.PARTICIPANT_NAME, participantName);
			component.setAttribute(WebComponentProperty.SHOW_ONLY_RECORDINGS, 'true');

			(component as any).updateIframeSrc();

			const iframe = component.shadowRoot?.querySelector('iframe');
			const url = new URL(iframe?.src || '');

			// Verify base URL
			expect(url.origin).toBe('https://recordings.example.com');
			expect(url.pathname).toBe('/view/rec-20231115-abc123');

			// Verify query parameters
			expect(url.searchParams.get(WebComponentProperty.PARTICIPANT_NAME)).toBe(participantName);
			expect(url.searchParams.get(WebComponentProperty.SHOW_ONLY_RECORDINGS)).toBe('true');

			// Verify origin was set correctly
			expect((component as any).targetIframeOrigin).toBe('https://recordings.example.com');
		});
	});
});
