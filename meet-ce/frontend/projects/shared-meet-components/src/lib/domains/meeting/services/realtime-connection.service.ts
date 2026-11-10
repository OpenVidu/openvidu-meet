import { inject, Service, signal } from '@angular/core';
import { MEET_REALTIME_HEARTBEAT, MeetRealtimeCloseCode, MeetRealtimeMessage } from '@openvidu-meet/typings';
import { filter, map, Observable, Subject } from 'rxjs';
import { HttpService } from '../../../shared/services/http.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';

/** Why the connection stopped on its own: the credential is unknown, a newer connection took its place, or it gave up. */
export type RealtimeStopReason = 'forbidden' | 'replaced' | 'gave_up';

export interface RealtimeCredential {
	/** Query parameter the feature registered on the server. */
	name: string;
	value: string;
}

export interface RealtimeConnectOptions {
	/** Stop, reported as `gave_up`, this long after the last message received. Without it, never give up. */
	giveUpAfterMs?: number;
}

const FIRST_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const RETRY_JITTER = 0.3;
/** The server sends a heartbeat every 20 s: this much silence means the connection is dead. */
const SILENCE_BEFORE_RECONNECT_MS = 50_000;
const SILENCE_BEFORE_WAKE_RECONNECT_MS = 25_000;

interface Session {
	url: string;
	giveUpAfterMs?: number;
	socket?: WebSocket;
	failedAttempts: number;
	lastMessageAt: number;
	retryTimer?: ReturnType<typeof setTimeout>;
	silenceTimer?: ReturnType<typeof setTimeout>;
	giveUpTimer?: ReturnType<typeof setTimeout>;
}

/**
 * The realtime connection from the meeting client to Meet. It reconnects with the same credential
 * after any loss it did not ask for, until a feature calls {@link disconnect} or the server refuses it.
 */
@Service()
export class RealtimeConnectionService {
	private readonly runtimeConfig = inject(RuntimeConfigService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - RealtimeConnectionService');

	private session?: Session;
	private readonly incoming = new Subject<MeetRealtimeMessage>();
	private readonly _isConnected = signal(false);
	private readonly _stopReason = signal<RealtimeStopReason | undefined>(undefined);

	readonly isConnected = this._isConnected.asReadonly();
	readonly stopReason = this._stopReason.asReadonly();

	private readonly onWake = () => {
		const session = this.session;

		if (!session || document.visibilityState === 'hidden') return;

		if (Date.now() - session.lastMessageAt > SILENCE_BEFORE_WAKE_RECONNECT_MS) {
			this.reconnect(session);
		}
	};

	connect(credential: RealtimeCredential, { giveUpAfterMs }: RealtimeConnectOptions = {}): void {
		this.disconnect();
		this._stopReason.set(undefined);
		this.session = { url: this.urlFor(credential), giveUpAfterMs, failedAttempts: 0, lastMessageAt: Date.now() };
		window.addEventListener('online', this.onWake);
		document.addEventListener('visibilitychange', this.onWake);
		this.open(this.session);
	}

	messages$<T>(type: string): Observable<T> {
		return this.incoming.pipe(
			filter((message) => message.type === type),
			map((message) => message.data as T)
		);
	}

	/** Closes the connection for good. */
	disconnect(): void {
		const session = this.session;

		if (!session) return;

		this.session = undefined;
		this.clearTimers(session);
		this.closeSocket(session);
		window.removeEventListener('online', this.onWake);
		document.removeEventListener('visibilitychange', this.onWake);
	}

	private urlFor({ name, value }: RealtimeCredential): string {
		const url = new URL(
			this.runtimeConfig.resolveUrl(`${HttpService.INTERNAL_API_PATH_PREFIX}/ws`),
			window.location.href
		);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		url.searchParams.set(name, value);
		return url.toString();
	}

	private open(session: Session): void {
		const socket = new WebSocket(session.url);
		session.socket = socket;
		this.watchSilence(session);

		socket.onopen = () => {
			session.failedAttempts = 0;
			this._isConnected.set(true);
		};

		socket.onmessage = (event: MessageEvent<string>) => this.receive(session, event.data);
		socket.onclose = (event: CloseEvent) => this.onClosed(session, socket, event.code);
	}

	private receive(session: Session, frame: string): void {
		session.lastMessageAt = Date.now();
		this.watchSilence(session);

		let message: MeetRealtimeMessage;

		try {
			message = JSON.parse(frame) as MeetRealtimeMessage;
		} catch {
			this.log.w('Ignoring a realtime message that is not JSON');
			return;
		}

		if (message.type !== MEET_REALTIME_HEARTBEAT) {
			this.incoming.next(message);
		}
	}

	private onClosed(session: Session, socket: WebSocket, code: number): void {
		if (session.socket !== socket) return;

		session.socket = undefined;
		this._isConnected.set(false);

		switch (code) {
			case MeetRealtimeCloseCode.FORBIDDEN:
				this.stop('forbidden');
				break;
			case MeetRealtimeCloseCode.REPLACED:
				this.stop('replaced');
				break;
			default:
				this.scheduleRetry(session);
		}
	}

	private scheduleRetry(session: Session): void {
		const backoff = Math.min(FIRST_RETRY_DELAY_MS * 2 ** session.failedAttempts, MAX_RETRY_DELAY_MS);
		const delay = backoff * (1 - RETRY_JITTER + Math.random() * 2 * RETRY_JITTER);
		session.failedAttempts++;
		this.log.d(`Realtime connection lost, reconnecting in ${Math.round(delay)} ms`);
		clearTimeout(session.retryTimer);
		session.retryTimer = setTimeout(() => this.open(session), delay);
	}

	private reconnect(session: Session): void {
		clearTimeout(session.retryTimer);
		this.closeSocket(session);
		this.open(session);
	}

	/** Every message, heartbeats included, proves the connection alive. */
	private watchSilence(session: Session): void {
		clearTimeout(session.silenceTimer);
		session.silenceTimer = setTimeout(() => this.reconnect(session), SILENCE_BEFORE_RECONNECT_MS);

		if (session.giveUpAfterMs !== undefined) {
			clearTimeout(session.giveUpTimer);
			const remaining = session.lastMessageAt + session.giveUpAfterMs - Date.now();
			session.giveUpTimer = setTimeout(() => this.stop('gave_up'), remaining);
		}
	}

	private stop(reason: RealtimeStopReason): void {
		this.log.w(`Realtime connection stopped: ${reason}`);
		this.disconnect();
		this._stopReason.set(reason);
	}

	private closeSocket(session: Session): void {
		const socket = session.socket;

		if (!socket) return;

		session.socket = undefined;
		socket.onopen = null;
		socket.onmessage = null;
		socket.onclose = null;
		socket.close();
		this._isConnected.set(false);
	}

	private clearTimers(session: Session): void {
		clearTimeout(session.retryTimer);
		clearTimeout(session.silenceTimer);
		clearTimeout(session.giveUpTimer);
	}
}
