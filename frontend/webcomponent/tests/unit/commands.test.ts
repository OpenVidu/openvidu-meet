import { describe, it, expect, jest } from '@jest/globals';
import { OpenViduMeet } from '../../src/components/OpenViduMeet';
import '../../src/index';
import { WebComponentCommand } from '../../src/models/command.model';
import { CommandsManager } from '../../src/components/CommandsManager';

describe('OpenViduMeet Web Component Commands', () => {
	let component: OpenViduMeet;
	let commandsManager: CommandsManager;

	beforeEach(() => {
		component = document.createElement('openvidu-meet') as OpenViduMeet;
		commandsManager = component['commandsManager'] as CommandsManager;
		document.body.appendChild(component);
	});

	afterEach(() => {
		document.body.removeChild(component);
		jest.restoreAllMocks();
		document.body.innerHTML = '';
	});

	it('should update allowedOrigin when setAllowedOrigin is called', () => {
		const testOrigin = 'https://test-origin.com';


		commandsManager.setTargetOrigin(testOrigin);
		expect(commandsManager['targetIframeOrigin']).toBe(testOrigin);

		// Check if it was updated
		expect((component as any).commandsManager.targetIframeOrigin).toBe(testOrigin);
	});

	it('should call commandsManager.leaveRoom when leaveRoom is called', () => {
		const meetSpy = jest.spyOn(component['commandsManager'], 'leaveRoom');

		const spy = jest.spyOn(commandsManager, 'sendMessage' as keyof CommandsManager);
		component.leaveRoom();

		expect(meetSpy).toHaveBeenCalled();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith({ command: WebComponentCommand.LEAVE_ROOM });
	});

	it('should call commandsManager.sendMessage when endMeeting is called', () => {
		const spy = jest.spyOn(commandsManager, 'sendMessage' as keyof CommandsManager);
		component.endMeeting();
		expect(spy).toHaveBeenCalledWith({ command: WebComponentCommand.END_MEETING });
	});

	it('should send message to iframe with correct origin', () => {
		// Mock iframe contentWindow and postMessage
		const mockPostMessage = jest.fn();
		const iframe = component.shadowRoot?.querySelector('iframe');

		// Mock the contentWindow
		Object.defineProperty(iframe, 'contentWindow', {
			value: { postMessage: mockPostMessage },
			writable: true
		});

		// Set allowed origin
		(component as any).commandsManager.setTargetOrigin('https://test.com');

		// Send a message
		(component as any).commandsManager.sendMessage({ command: 'TEST' });

		// Check if postMessage was called correctly
		expect(mockPostMessage).toHaveBeenCalledWith({ command: 'TEST' }, 'https://test.com');
	});

	// it('should call commandsManager.sendMessage when toggleChat is called', () => {
	// 	const spy = jest.spyOn(component['commandsManager'], 'sendMessage');
	// 	component.toggleChat();
	// 	expect(spy).toHaveBeenCalledWith({ action: WebComponentCommand.TOGGLE_CHAT });
	// });
});
