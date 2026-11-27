import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '../../../../../../shared/services/i18n/translate.service';
import { ChatMessage } from '../../../models/chat.model';
import { ChatService } from '../../../services/chat/chat.service';
import { MeetingUiConfigService } from '../../../services/config/meeting-ui-config.service';
import { E2eeService } from '../../../services/e2ee/e2ee.service';
import { PanelService } from '../../../services/panel/panel.service';
import { ParticipantService } from '../../../services/participant/participant.service';
import { ChatPanelComponent } from './chat-panel.component';

const message = (text: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
	isLocal: false,
	participantName: 'Alice',
	message: text,
	...overrides
});
const numbered = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => message(`message-${from + i}`));

describe('ChatPanelComponent', () => {
	let fixture: ComponentFixture<ChatPanelComponent>;
	let messages: WritableSignal<ChatMessage[]>;
	let savesChat: WritableSignal<boolean>;
	let encrypted: boolean;
	let loadEarlier: jasmine.Spy;

	const element = (selector: string): HTMLElement => fixture.nativeElement.querySelector(selector);
	const container = () => element('.messages-container');

	const render = async () => {
		fixture.detectChanges();
		await fixture.whenStable();
	};

	function create() {
		fixture = TestBed.createComponent(ChatPanelComponent);
		fixture.detectChanges();
	}

	beforeEach(() => {
		messages = signal([]);
		savesChat = signal(false);
		encrypted = false;
		loadEarlier = jasmine.createSpy('loadEarlier').and.resolveTo();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{
					provide: TranslateService,
					useValue: { translate: (key: string) => key, translationsLoaded: signal(0) }
				},
				{ provide: ChatService, useValue: { chatMessages: messages, savesChat, loadEarlier } },
				{ provide: PanelService, useValue: { isChatPanelOpened: () => true, togglePanel: () => {} } },
				{
					provide: E2eeService,
					useValue: {
						get isEnabled() {
							return encrypted;
						}
					}
				},
				{ provide: ParticipantService, useValue: { hasRemoteEncryptionErrorsSignal: () => false } },
				{ provide: MeetingUiConfigService, useValue: { chatInputEnabledSignal: signal(true) } }
			]
		});
	});

	afterEach(() => jasmine.clock().uninstall());

	describe('senders and notices', () => {
		it('labels the messages of an anonymous participant, and not the own', async () => {
			messages.set([
				message('hi', { anonymous: true }),
				message('mine', { isLocal: true, anonymous: true }),
				message('hello')
			]);
			create();
			await render();

			const names = [...fixture.nativeElement.querySelectorAll('.participant-name-container p')].map((p) =>
				(p as HTMLElement).textContent!.replace(/\s+/g, ' ').trim()
			);

			expect(names).toEqual(['Alice PANEL.CHAT.ANONYMOUS', 'PANEL.CHAT.YOU', 'Alice']);
		});

		it('says that messages are not saved in an encrypted room', async () => {
			encrypted = true;
			create();
			await render();

			expect(element('.text-info').textContent).toContain('PANEL.CHAT.NOT_SAVED');
			expect(element('.text-info').textContent).not.toContain('PANEL.CHAT.SUBTITLE');
		});

		it('says that messages are removed at the end of a meeting that does not save them', async () => {
			create();
			await render();

			expect(element('.text-info').textContent).toContain('PANEL.CHAT.SUBTITLE');
		});

		it('says nothing about the end of the meeting when it saves the messages', async () => {
			savesChat.set(true);
			create();
			await render();

			expect(element('.text-info')).toBeNull();
		});
	});

	describe('scrolling', () => {
		/**
		 * The panel's own layout gives the list no height in a test, so it is given one that overflows, and
		 * the browser's own scroll anchoring is off, as in browsers without it.
		 */
		const fixHeight = () => {
			Object.assign(container().style, {
				height: '200px',
				flex: 'none',
				display: 'block',
				overflowAnchor: 'none'
			});
		};

		const top = (text: string): number => {
			const bubble = [...fixture.nativeElement.querySelectorAll('.chat-message')].find((el: HTMLElement) =>
				el.textContent!.includes(text)
			) as HTMLElement;

			return bubble.getBoundingClientRect().top - container().getBoundingClientRect().top;
		};

		beforeEach(async () => {
			jasmine.clock().install();
			messages.set(numbered(11, 30));
			create();
			fixHeight();
			await render();
			jasmine.clock().tick(100);
		});

		it('starts at the newest message', () => {
			expect(container().scrollTop + container().clientHeight).toBeGreaterThanOrEqual(
				container().scrollHeight - 1
			);
		});

		it('keeps the message the participant was reading where it was when earlier ones are added above', async () => {
			container().scrollTop = 150;
			const before = top('message-20');

			messages.update((shown) => [...numbered(1, 10), ...shown]);
			await render();

			expect(top('message-20')).toBeCloseTo(before, 0);
		});

		it('scrolls to the bottom when a message is added after the last one', async () => {
			container().scrollTop = 0;

			messages.update((shown) => [...shown, message('message-31')]);
			await render();
			jasmine.clock().tick(20);

			expect(container().scrollTop + container().clientHeight).toBeGreaterThanOrEqual(
				container().scrollHeight - 1
			);
		});

		it('asks for earlier messages when the participant scrolls to the top', () => {
			container().scrollTop = 0;
			container().dispatchEvent(new Event('scroll'));

			expect(loadEarlier).toHaveBeenCalledTimes(1);
		});

		it('does not ask for earlier messages while the participant is not at the top', () => {
			container().scrollTop = 150;
			container().dispatchEvent(new Event('scroll'));

			expect(loadEarlier).not.toHaveBeenCalled();
		});
	});
});
