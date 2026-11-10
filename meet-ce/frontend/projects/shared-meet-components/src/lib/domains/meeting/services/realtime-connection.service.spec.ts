import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetRealtimeCloseCode } from '@openvidu-meet/typings';
import { LoggerService } from '../../../shared/services/logger.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { RealtimeConnectionService } from './realtime-connection.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

class FakeWebSocket {
	static instances: FakeWebSocket[] = [];

	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: ((event: { code: number }) => void) | null = null;
	readonly close = jasmine.createSpy('close');

	constructor(readonly url: string) {
		FakeWebSocket.instances.push(this);
	}

	static get latest(): FakeWebSocket {
		return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
	}

	serverOpens(): void {
		this.onopen?.();
	}

	serverSends(message: object): void {
		this.onmessage?.({ data: JSON.stringify(message) });
	}

	serverCloses(code: number): void {
		this.onclose?.({ code });
	}
}

const CREDENTIAL = { name: 'lobbyTicket', value: 'ticket 1' };

describe('RealtimeConnectionService', () => {
	let service: RealtimeConnectionService;
	let serverBaseUrl: ReturnType<typeof signal<string>>;
	const originalWebSocket = window.WebSocket;

	const resolveUrl = (path: string) => `${serverBaseUrl() || '/meet'}/${path}`;

	beforeEach(() => {
		FakeWebSocket.instances = [];
		window.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		jasmine.clock().install();
		jasmine.clock().mockDate(new Date('2026-11-10T10:00:00Z'));
		spyOn(Math, 'random').and.returnValue(0.5);
		serverBaseUrl = signal('');

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: RuntimeConfigService, useValue: { resolveUrl, serverBaseUrl } }
			]
		});
		service = TestBed.inject(RealtimeConnectionService);
	});

	afterEach(() => {
		service.disconnect();
		jasmine.clock().uninstall();
		window.WebSocket = originalWebSocket;
	});

	describe('URL', () => {
		it('uses ws:// on the page origin under the Meet base path', () => {
			service.connect(CREDENTIAL);

			const expected = new URL('/meet/internal-api/v1/ws?lobbyTicket=ticket+1', window.location.href);
			expected.protocol = 'ws:';
			expect(FakeWebSocket.latest.url).toBe(expected.toString());
		});

		it('uses wss:// on the Meet origin of a web component', () => {
			serverBaseUrl.set('https://meet.example.com/meet');

			service.connect(CREDENTIAL);

			expect(FakeWebSocket.latest.url).toBe(
				'wss://meet.example.com/meet/internal-api/v1/ws?lobbyTicket=ticket+1'
			);
		});
	});

	describe('messages', () => {
		it('hands each type its payloads, never the heartbeat', () => {
			const states: unknown[] = [];
			service.messages$('lobby.state').subscribe((data) => states.push(data));
			service.connect(CREDENTIAL);
			const socket = FakeWebSocket.latest;
			socket.serverOpens();

			socket.serverSends({ type: 'heartbeat' });
			socket.serverSends({ type: 'other.thing', data: 1 });
			socket.serverSends({ type: 'lobby.state', data: { status: 'waiting' } });

			expect(states).toEqual([{ status: 'waiting' }]);
			expect(service.isConnected()).toBeTrue();
		});
	});

	describe('reconnection', () => {
		it('waits 1, 2, 4 and up to 30 s between attempts, with the same credential', () => {
			service.connect(CREDENTIAL);
			const delays: number[] = [];

			for (let attempt = 0; attempt < 7; attempt++) {
				const socket = FakeWebSocket.latest;
				socket.serverCloses(1006);
				let waited = 0;

				while (FakeWebSocket.latest === socket) {
					jasmine.clock().tick(100);
					waited += 100;
				}

				delays.push(waited);
			}

			expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
			expect(new Set(FakeWebSocket.instances.map(({ url }) => url)).size).toBe(1);
		});

		it('spreads the delays by up to 30 % either way', () => {
			(Math.random as jasmine.Spy).and.returnValue(0);
			service.connect(CREDENTIAL);
			FakeWebSocket.latest.serverCloses(1006);

			jasmine.clock().tick(699);
			expect(FakeWebSocket.instances.length).toBe(1);
			jasmine.clock().tick(1);
			expect(FakeWebSocket.instances.length).toBe(2);
		});

		it('starts again from 1 s once a connection opens', () => {
			service.connect(CREDENTIAL);
			FakeWebSocket.latest.serverCloses(1006);
			jasmine.clock().tick(1_000);
			FakeWebSocket.latest.serverCloses(1006);
			jasmine.clock().tick(2_000);
			FakeWebSocket.latest.serverOpens();

			FakeWebSocket.latest.serverCloses(1006);
			jasmine.clock().tick(1_000);

			expect(FakeWebSocket.instances.length).toBe(4);
		});

		it('reconnects after a refusal to try again later', () => {
			service.connect(CREDENTIAL);
			FakeWebSocket.latest.serverCloses(MeetRealtimeCloseCode.TRY_AGAIN_LATER);

			jasmine.clock().tick(1_000);

			expect(FakeWebSocket.instances.length).toBe(2);
		});

		it('reconnects after 50 s without any message', () => {
			service.connect(CREDENTIAL);
			const socket = FakeWebSocket.latest;
			socket.serverOpens();

			jasmine.clock().tick(20_000);
			socket.serverSends({ type: 'heartbeat' });
			jasmine.clock().tick(49_999);
			expect(FakeWebSocket.instances.length).toBe(1);

			jasmine.clock().tick(1);
			expect(socket.close).toHaveBeenCalled();
			expect(FakeWebSocket.instances.length).toBe(2);
		});

		it('reconnects at once when the network comes back after more than 25 s of silence', () => {
			service.connect(CREDENTIAL);
			FakeWebSocket.latest.serverOpens();

			jasmine.clock().tick(25_000);
			window.dispatchEvent(new Event('online'));
			expect(FakeWebSocket.instances.length).toBe(1);

			jasmine.clock().tick(1);
			window.dispatchEvent(new Event('online'));
			expect(FakeWebSocket.instances.length).toBe(2);
		});

		it('reconnects at once when the page becomes visible after more than 25 s of silence', () => {
			service.connect(CREDENTIAL);
			FakeWebSocket.latest.serverOpens();

			jasmine.clock().tick(30_000);
			document.dispatchEvent(new Event('visibilitychange'));

			expect(FakeWebSocket.instances.length).toBe(2);
		});
	});

	describe('stopping', () => {
		it('stops when the credential is not known', () => {
			service.connect(CREDENTIAL);
			FakeWebSocket.latest.serverCloses(MeetRealtimeCloseCode.FORBIDDEN);

			jasmine.clock().tick(60_000);

			expect(FakeWebSocket.instances.length).toBe(1);
			expect(service.stopReason()).toBe('forbidden');
		});

		it('stops when a newer connection took its place', () => {
			service.connect(CREDENTIAL);
			FakeWebSocket.latest.serverCloses(MeetRealtimeCloseCode.REPLACED);

			jasmine.clock().tick(60_000);

			expect(FakeWebSocket.instances.length).toBe(1);
			expect(service.stopReason()).toBe('replaced');
		});

		it('gives up that long after the last message received', () => {
			service.connect(CREDENTIAL, { giveUpAfterMs: 60_000 });
			FakeWebSocket.latest.serverOpens();
			jasmine.clock().tick(10_000);
			FakeWebSocket.latest.serverSends({ type: 'heartbeat' });
			FakeWebSocket.latest.serverCloses(1006);

			jasmine.clock().tick(59_999);
			expect(service.stopReason()).toBeUndefined();

			jasmine.clock().tick(1);
			expect(service.stopReason()).toBe('gave_up');
			const attempts = FakeWebSocket.instances.length;
			jasmine.clock().tick(60_000);
			expect(FakeWebSocket.instances.length).toBe(attempts);
		});

		it('closes for good on disconnect', () => {
			service.connect(CREDENTIAL);
			const socket = FakeWebSocket.latest;
			socket.serverOpens();

			service.disconnect();
			jasmine.clock().tick(120_000);
			window.dispatchEvent(new Event('online'));

			expect(socket.close).toHaveBeenCalled();
			expect(FakeWebSocket.instances.length).toBe(1);
			expect(service.isConnected()).toBeFalse();
			expect(service.stopReason()).toBeUndefined();
		});
	});
});
