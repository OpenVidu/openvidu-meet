import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  OpenViduMeetClosedDetail,
  OpenViduMeetJoinedDetail,
  OpenViduMeetLeftDetail,
} from '@openvidu-meet-wc';
import { OpenviduMeetComponent } from '@openvidu-meet-wc';

// `socket.io-client` is loaded via a <script> tag in index.html (served by the
// local webhook-bridge under /socket.io/socket.io.js), so `window.io` is the
// global factory. Typed loosely to avoid pulling the package into the bundle.
type SocketLike = { on: (event: string, cb: (payload: any) => void) => void; disconnect: () => void };
type IOFactory = () => SocketLike;

interface WebhookEventPayload {
  event?: string;
  creationDate?: number | string;
  data?: { roomId?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

@Component({
  selector: 'app-root',
  imports: [OpenviduMeetComponent, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly meetRef = viewChild(OpenviduMeetComponent);

  // ── Config form (editable inputs) ──────────────────────────────────────
  protected roomUrlInput = 'http://localhost:6080/meet/room/room-6vnlh1ltf4ej3mh?secret=1d766d7734';
  protected recordingUrlInput = '';
  protected participantNameInput = 'Test User';
  protected e2eeKeyInput = '';
  protected leaveRedirectUrlInput = '';
  protected showRecordingInput = '';
  protected showOnlyRecordingsInput = false;
  protected kickIdentityInput = 'test-participant-1';

  // ── Applied signals (bound to the WC via Angular wrapper inputs) ────────
  // Use `undefined` for empty values so the WC's mode resolution doesn't see
  // empty strings as set attributes (e.g. an empty roomUrl alongside a real
  // recordingUrl would otherwise confuse `resolveMode`).
  protected readonly roomUrl = signal<string | undefined>(undefined);
  protected readonly recordingUrl = signal<string | undefined>(undefined);
  protected readonly participantName = signal<string | undefined>(undefined);
  protected readonly e2eeKey = signal<string | undefined>(undefined);
  protected readonly leaveRedirectUrl = signal<string | undefined>(undefined);
  protected readonly showRecording = signal<string | undefined>(undefined);
  protected readonly showOnlyRecordings = signal<boolean | undefined>(undefined);

  // The WC is gated behind `applyConfig()` so tests (and dev usage) can set
  // attributes before the element first mounts — letting the WC pick up the
  // correct mode/attributes from the very first render rather than going
  // through a property-reassignment path that the WC may not fully react to.
  protected readonly wcMounted = signal(false);

  // ── Event log ────────────────────────────────────────────────────────────
  protected readonly eventLog = signal<string[]>([]);

  // ── on() callback reference stored for paired off() call ────────────────
  private onJoinedHandler: ((detail: OpenViduMeetJoinedDetail) => void) | null = null;

  constructor() {
    this.connectWebhookSocket();
  }

  // ── Webhook bridge (Socket.IO) ───────────────────────────────────────────
  //
  // Connects to the local webhook-bridge server (proxied through Angular's
  // dev server at /socket.io). For every webhook the bridge broadcasts, we
  // append a hidden `<li class="webhook-{eventName}">` marker to document.body
  // so the e2e suite's `webhookLocator(page, name)` and `expectWebhook` calls
  // can observe events without needing to wire socket.io into the test fixture.

  private connectWebhookSocket(): void {
    const io = (window as unknown as { io?: IOFactory }).io;

    if (typeof io !== 'function') {
      // Bridge is optional during dev; nothing to do if the script never loaded.
      console.warn('[testapp] window.io not found — webhook bridge inactive');
      return;
    }

    const socket = io();
    socket.on('webhookEvent', (event: WebhookEventPayload) => this.handleWebhookEvent(event));

    inject(DestroyRef).onDestroy(() => socket.disconnect());
  }

  private handleWebhookEvent(event: WebhookEventPayload): void {
    const name = event?.event ?? 'unknown';
    this.appendWebhookMarker(name, event);
    this.saveWebhookToSessionStorage(event);
    this.log(`[webhook] ${name}`);
  }

  // Mirrors the legacy testapp's `webhookEventsByRoom` sessionStorage map so
  // `getWebhookFromStorage` in the e2e suite keeps working unchanged.
  private saveWebhookToSessionStorage(event: WebhookEventPayload): void {
    const roomId = event?.data?.roomId;

    if (typeof roomId !== 'string' || !roomId) return;

    const raw = sessionStorage.getItem('webhookEventsByRoom');
    const map: Record<string, WebhookEventPayload[]> = raw ? JSON.parse(raw) : {};

    if (!map[roomId]) {
      map[roomId] = [];
    }

    map[roomId].push(event);
    sessionStorage.setItem('webhookEventsByRoom', JSON.stringify(map));
  }

  private appendWebhookMarker(name: string, event: WebhookEventPayload): void {
    let log = document.getElementById('__wc-webhook-markers');

    if (!log) {
      log = document.createElement('ul');
      log.id = '__wc-webhook-markers';
      // Positioned off-viewport but with a real box so Playwright's
      // `toBeVisible()` passes on each child — same convention as the
      // `event-{name}` markers added by `ensureFixture`.
      log.style.cssText =
        'position:fixed;top:-9999px;left:0;width:auto;height:auto;pointer-events:none;margin:0;padding:0;list-style:none;';
      document.body.appendChild(log);
    }

    const li = document.createElement('li');
    li.className = `webhook-${name}`;

    try {
      li.textContent = JSON.stringify(event);
    } catch {
      li.textContent = '';
    }

    log.appendChild(li);
  }

  // ── Config ───────────────────────────────────────────────────────────────

  protected applyConfig(): void {
    this.roomUrl.set(this.roomUrlInput || undefined);
    this.recordingUrl.set(this.recordingUrlInput || undefined);
    this.participantName.set(this.participantNameInput || undefined);
    this.e2eeKey.set(this.e2eeKeyInput || undefined);
    this.leaveRedirectUrl.set(this.leaveRedirectUrlInput || undefined);
    this.showRecording.set(this.showRecordingInput || undefined);
    this.showOnlyRecordings.set(this.showOnlyRecordingsInput);
    this.wcMounted.set(true);
    this.log('Config applied');
  }

  // ── Angular output bindings ───────────────────────────────────────────────

  protected handleJoined(event: CustomEvent<OpenViduMeetJoinedDetail>): void {
    this.log(
      `[output] joined — room: ${event.detail.roomId}, identity: ${event.detail.participantIdentity}`
    );
  }

  protected handleLeft(event: CustomEvent<OpenViduMeetLeftDetail>): void {
    this.log(`[output] left — room: ${event.detail.roomId}, reason: ${event.detail.reason}`);
  }

  protected handleClosed(event: CustomEvent<OpenViduMeetClosedDetail>): void {
    this.log('[output] closed');
  }

  // ── Imperative API ────────────────────────────────────────────────────────

  protected callEndMeeting(): void {
    this.meetRef()?.endMeeting();
    this.log('→ endMeeting()');
  }

  protected callLeaveRoom(): void {
    this.meetRef()?.leaveRoom();
    this.log('→ leaveRoom()');
  }

  protected callKickParticipant(): void {
    this.meetRef()?.kickParticipant(this.kickIdentityInput);
    this.log(`→ kickParticipant("${this.kickIdentityInput}")`);
  }

  // ── on / once / off API ───────────────────────────────────────────────────

  protected callOn(): void {
    const ref = this.meetRef();

    if (!ref) {
      this.log('⚠ meetRef not ready');
      return;
    }

    if (this.onJoinedHandler) {
      this.log('⚠ on("joined") handler already registered — call off first');
      return;
    }

    this.onJoinedHandler = (d) => this.log(`[on] joined — identity: ${d.participantIdentity}`);
    ref.on('joined', this.onJoinedHandler);
    this.log('on("joined", handler) registered');
  }

  protected callOnce(): void {
    const ref = this.meetRef();

    if (!ref) {
      this.log('⚠ meetRef not ready');
      return;
    }

    ref.once('joined', (d) => this.log(`[once] joined — identity: ${d.participantIdentity}`));
    this.log('once("joined", handler) registered');
  }

  protected callOff(): void {
    const ref = this.meetRef();

    if (!ref) {
      this.log('⚠ meetRef not ready');
      return;
    }

    if (!this.onJoinedHandler) {
      this.log('⚠ no on("joined") handler registered');
      return;
    }

    ref.off('joined', this.onJoinedHandler);
    this.onJoinedHandler = null;
    this.log('off("joined", handler) called');
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  protected clearLog(): void {
    this.eventLog.set([]);
  }

  private log(msg: string): void {
    const ts = new Date().toLocaleTimeString();
    this.eventLog.update((log) => [`[${ts}] ${msg}`, ...log].slice(0, 100));
  }
}
