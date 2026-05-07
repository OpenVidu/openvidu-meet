import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
    OpenViduMeetClosedDetail,
    OpenViduMeetJoinedDetail,
    OpenViduMeetLeftDetail,
} from '@openvidu-meet-wc';
import { OpenviduMeetComponent } from '@openvidu-meet-wc';

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
  protected roomUrlInput = 'http://localhost:6080/meet/room/room-8pfi40iqh3wfish?secret=827bfd3d41';
  protected participantNameInput = 'Test User';
  protected e2eeKeyInput = '';
  protected leaveRedirectUrlInput = '';
  protected showRecordingInput = '';
  protected showOnlyRecordingsInput = false;
  protected kickIdentityInput = 'test-participant-1';

  // ── Applied signals (bound to the WC via Angular wrapper inputs) ────────
  protected readonly roomUrl = signal(this.roomUrlInput);
  protected readonly participantName = signal('Test User');
  protected readonly e2eeKey = signal('');
  protected readonly leaveRedirectUrl = signal('');
  protected readonly showRecording = signal('');
  protected readonly showOnlyRecordings = signal(false);

  // ── Event log ────────────────────────────────────────────────────────────
  protected readonly eventLog = signal<string[]>([]);

  // ── on() callback reference stored for paired off() call ────────────────
  private onJoinedHandler: ((detail: OpenViduMeetJoinedDetail) => void) | null = null;

  // ── Config ───────────────────────────────────────────────────────────────

  protected applyConfig(): void {
    this.roomUrl.set(this.roomUrlInput);
    this.participantName.set(this.participantNameInput);
    this.e2eeKey.set(this.e2eeKeyInput);
    this.leaveRedirectUrl.set(this.leaveRedirectUrlInput);
    this.showRecording.set(this.showRecordingInput);
    this.showOnlyRecordings.set(this.showOnlyRecordingsInput);
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
