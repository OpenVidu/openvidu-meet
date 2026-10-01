import { computed, Signal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import {
	isRedactedStreamUrl,
	isValidStreamUrl,
	MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH,
	MeetBroadcastDestinationOptions
} from '@openvidu-meet/typings';
import { BROADCAST_PLATFORM_LABELS, BroadcastPlatform } from '../models/broadcast.model';
import { detectBroadcastPlatform } from './broadcast-platform.utils';

/**
 * An `rtmp://` or `rtmps://` URL with an app and a stream key, the form the media server streams to;
 * an empty value is left to the required check.
 */
export const rtmpUrlValidator: ValidatorFn = (control) => {
	const value = (control.value as string).trim();

	if (!value) return null;

	try {
		const { protocol } = new URL(value);
		return (protocol === 'rtmp:' || protocol === 'rtmps:') && isValidStreamUrl(value) ? null : { rtmpUrl: true };
	} catch {
		return { rtmpUrl: true };
	}
};

/**
 * A redacted URL only stands for the URL a destination was served with: the server has no stream
 * key to go with any other, so a changed host or path needs the full URL.
 */
export const servedUrlValidator =
	(servedUrl: () => string | undefined): ValidatorFn =>
	(control) => {
		const url = (control.value as string).trim();
		return isRedactedStreamUrl(url) && url !== servedUrl() ? { streamKeyRequired: true } : null;
	};

/**
 * The form both places that edit a broadcast destination share: the wizard, for the room's saved
 * destinations, and the activity, for the ones added for a meeting. It validates the name and the RTMP URL,
 * tells which platform the URL streams to as it is typed, and knows when a saved destination keeps
 * its stream key. Created in an injection context, since it reads the URL as a signal.
 */
export class DestinationEditor {
	readonly nameMaxLength = MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH;
	readonly form: FormGroup<{ name: FormControl<string>; url: FormControl<string> }>;
	/** The platform the URL streams to, as soon as its host says so. */
	readonly platform: Signal<BroadcastPlatform>;
	readonly platformLabel: Signal<string>;
	/** A saved destination whose URL is still the redacted one it was served with keeps its stream key. */
	readonly keepsSavedKey: Signal<boolean>;
	/** Why the server refused the destination last submitted, until it is edited or submitted again. */
	readonly rejection = signal<string | undefined>(undefined);

	/** The URL the destination being edited was served with, redacted when it is a saved one. */
	private readonly servedUrl = signal<string | undefined>(undefined);

	constructor(formBuilder: FormBuilder) {
		this.form = formBuilder.nonNullable.group({
			name: ['', [Validators.required, Validators.maxLength(MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH)]],
			url: ['', [Validators.required, rtmpUrlValidator, servedUrlValidator(() => this.servedUrl())]]
		});
		const url = toSignal(this.form.controls.url.valueChanges, { initialValue: '' });
		this.platform = computed(() => detectBroadcastPlatform(url()));
		this.platformLabel = computed(() => BROADCAST_PLATFORM_LABELS[this.platform()]);
		this.keepsSavedKey = computed(() => isRedactedStreamUrl(url()) && url().trim() === this.servedUrl());
		this.form.valueChanges.subscribe(() => this.rejection.set(undefined));
	}

	/** Starts editing the given destination, or a new one; `servedUrl` is the saved URL as it was served. */
	open(destination: MeetBroadcastDestinationOptions = { name: '', url: '' }, servedUrl?: string): void {
		this.servedUrl.set(servedUrl);
		this.form.reset(destination);
	}

	/** The destination as edited, trimmed, once it is valid; otherwise marks the fields and yields nothing. */
	submit(): MeetBroadcastDestinationOptions | undefined {
		this.rejection.set(undefined);

		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return undefined;
		}

		const { name, url } = this.form.getRawValue();
		return { name: name.trim(), url: url.trim() };
	}
}
