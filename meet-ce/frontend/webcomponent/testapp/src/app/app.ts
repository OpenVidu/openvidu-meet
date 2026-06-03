import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { OpenViduMeetJoinedDetail, OpenViduMeetLeftDetail } from '@openvidu-meet-wc';
import { OpenviduMeetComponent } from '@openvidu-meet-wc';
import { EventLog } from './components/event-log/event-log';
import { EventLogService } from './services/event-log';

@Component({
	selector: 'app-root',
	imports: [OpenviduMeetComponent, FormsModule, EventLog],
	templateUrl: './app.html',
	styleUrl: './app.css',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
	protected readonly log = inject(EventLogService);

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

	// ── on() callback reference stored for paired off() call ────────────────
	private onJoinedHandler: ((detail: OpenViduMeetJoinedDetail) => void) | null = null;

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
		this.log.log('Config applied');
	}

	// ── Angular output bindings ───────────────────────────────────────────────

	protected handleJoined(event: CustomEvent<OpenViduMeetJoinedDetail>): void {
		this.log.log(`[output] joined — room: ${event.detail.roomId}, identity: ${event.detail.participantIdentity}`);
	}

	protected handleLeft(event: CustomEvent<OpenViduMeetLeftDetail>): void {
		this.log.log(`[output] left — room: ${event.detail.roomId}, reason: ${event.detail.reason}`);
	}

	protected handleClosed(): void {
		this.log.log('[output] closed');
	}

	// ── Imperative API ────────────────────────────────────────────────────────

	protected callEndMeeting(): void {
		this.meetRef()?.endMeeting();
		this.log.log('→ endMeeting()');
	}

	protected callLeaveRoom(): void {
		this.meetRef()?.leaveRoom();
		this.log.log('→ leaveRoom()');
	}

	protected callKickParticipant(): void {
		this.meetRef()?.kickParticipant(this.kickIdentityInput);
		this.log.log(`→ kickParticipant("${this.kickIdentityInput}")`);
	}

	// ── on / once / off API ───────────────────────────────────────────────────

	protected callOn(): void {
		const ref = this.meetRef();

		if (!ref) {
			this.log.log('⚠ meetRef not ready');
			return;
		}

		if (this.onJoinedHandler) {
			this.log.log('⚠ on("joined") handler already registered — call off first');
			return;
		}

		this.onJoinedHandler = (d) => this.log.log(`[on] joined — identity: ${d.participantIdentity}`);
		ref.on('joined', this.onJoinedHandler);
		this.log.log('on("joined", handler) registered');
	}

	protected callOnce(): void {
		const ref = this.meetRef();

		if (!ref) {
			this.log.log('⚠ meetRef not ready');
			return;
		}

		ref.once('joined', (d) => this.log.log(`[once] joined — identity: ${d.participantIdentity}`));
		this.log.log('once("joined", handler) registered');
	}

	protected callOff(): void {
		const ref = this.meetRef();

		if (!ref) {
			this.log.log('⚠ meetRef not ready');
			return;
		}

		if (!this.onJoinedHandler) {
			this.log.log('⚠ no on("joined") handler registered');
			return;
		}

		ref.off('joined', this.onJoinedHandler);
		this.onJoinedHandler = null;
		this.log.log('off("joined", handler) called');
	}
}
