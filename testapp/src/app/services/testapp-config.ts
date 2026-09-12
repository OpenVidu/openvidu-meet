import { computed, Injectable, signal } from '@angular/core';
import { TriState, toOptionalBoolean } from '../models';

/** The property set applied to the embedded app on the last "Apply and remount". */
export interface MeetEmbedConfig {
	roomUrl?: string;
	recordingUrl?: string;
	participantName?: string;
	participantExternalId?: string;
	participantMetadata?: string;
	initialAudioActive?: boolean;
	initialVideoActive?: boolean;
	e2eeKey?: string;
	leaveRedirectUrl?: string;
	showRecording?: string;
	showOnlyRecordings?: boolean;
}

const optional = (value: string): string | undefined => value || undefined;

/**
 * Holds the Setup form. The draft signals are what the panel edits; `applied` is
 * the snapshot the shell binds to the embedded app, so the two can differ and
 * the panel can tell the user an apply is pending.
 */
@Injectable({ providedIn: 'root' })
export class TestappConfigStore {
	readonly roomUrl = signal('http://localhost:6080/meet/room/room-6vnlh1ltf4ej3mh?secret=1d766d7734');
	readonly recordingUrl = signal('');
	readonly participantName = signal('Test User');
	readonly participantExternalId = signal('');
	readonly participantMetadata = signal('');
	readonly e2eeKey = signal('');
	readonly leaveRedirectUrl = signal('');
	readonly showRecording = signal('');
	readonly showOnlyRecordings = signal(false);
	readonly initialAudioActive = signal<TriState>('');
	readonly initialVideoActive = signal<TriState>('');

	private readonly draft = computed(() => ({
		roomUrl: this.roomUrl(),
		recordingUrl: this.recordingUrl(),
		participantName: this.participantName(),
		participantExternalId: this.participantExternalId(),
		participantMetadata: this.participantMetadata(),
		e2eeKey: this.e2eeKey(),
		leaveRedirectUrl: this.leaveRedirectUrl(),
		showRecording: this.showRecording(),
		showOnlyRecordings: this.showOnlyRecordings(),
		initialAudioActive: this.initialAudioActive(),
		initialVideoActive: this.initialVideoActive()
	}));

	private readonly appliedDraft = signal<string | null>(null);
	private readonly _applied = signal<MeetEmbedConfig | null>(null);

	/** The config currently bound to the embedded app, or `null` before the first apply. */
	readonly applied = this._applied.asReadonly();

	/** Whether the form has been edited since the last apply. */
	readonly isDirty = computed(() => {
		const applied = this.appliedDraft();
		return applied !== null && applied !== JSON.stringify(this.draft());
	});

	/** Snapshots the draft as the applied config and returns it. */
	apply(): MeetEmbedConfig {
		const draft = this.draft();
		const config: MeetEmbedConfig = {
			roomUrl: optional(draft.roomUrl),
			recordingUrl: optional(draft.recordingUrl),
			participantName: optional(draft.participantName),
			participantExternalId: optional(draft.participantExternalId),
			participantMetadata: optional(draft.participantMetadata),
			initialAudioActive: toOptionalBoolean(draft.initialAudioActive),
			initialVideoActive: toOptionalBoolean(draft.initialVideoActive),
			e2eeKey: optional(draft.e2eeKey),
			leaveRedirectUrl: optional(draft.leaveRedirectUrl),
			showRecording: optional(draft.showRecording),
			showOnlyRecordings: draft.showOnlyRecordings
		};

		this.appliedDraft.set(JSON.stringify(draft));
		this._applied.set(config);

		return config;
	}
}
