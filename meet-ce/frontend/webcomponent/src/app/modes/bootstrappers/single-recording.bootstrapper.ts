import { Injectable, inject } from '@angular/core';
import { RecordingEntryService, type RecordingEntryParams } from '@openvidu-meet/shared-components';
import { lastPathSegment, queryParam } from '../../utils/url';
import type { ModeInputs } from '../mode';
import type { ModeBootstrapResult, ModeBootstrapper } from './bootstrapper';

/**
 * Bootstraps `single-recording` mode. The recording id is taken from
 * `recordingUrl`'s last path segment, falling back to the `showRecording`
 * shorthand attribute. The room secret (if any) is forwarded so users with
 * room permissions can resolve access via the room-permission path.
 */
@Injectable({ providedIn: 'root' })
export class SingleRecordingModeBootstrapper implements ModeBootstrapper {
	private readonly recordingEntryService = inject(RecordingEntryService);

	async bootstrap(inputs: ModeInputs): Promise<ModeBootstrapResult> {
		const recordingId = lastPathSegment(inputs.recordingUrl) ?? inputs.showRecording ?? '';

		if (!recordingId) {
			return {
				kind: 'error',
				detail: {
					reason: 'invalid-recording-id',
					message: 'Cannot extract recording ID from "recording-url" or "show-recording".'
				}
			};
		}

		const params: RecordingEntryParams = {
			recordingId,
			recordingSecret: queryParam(inputs.recordingUrl, 'recordingSecret') || undefined,
			roomSecret: queryParam(inputs.roomUrl, 'secret') || undefined
		};

		try {
			const outcome = await this.recordingEntryService.attempt(params);
			switch (outcome.kind) {
				case 'ready':
					return { kind: 'ready' };
				case 'login-required':
					// The WC has no in-app login screen — hosts subscribe to the
					// `error` event with reason `'auth-required'` to drive their
					// own login dialog or redirect.
					return {
						kind: 'error',
						detail: {
							reason: 'auth-required',
							message:
								'Authentication is required to view this recording. Please open the recording link in a signed-in session.'
						}
					};
				case 'error':
					return {
						kind: 'error',
						detail: {
							reason: 'access-denied',
							message: 'Unable to load this recording. Please check the link and try again.',
							accessReason: outcome.reason
						}
					};
			}
		} catch {
			return {
				kind: 'error',
				detail: {
					reason: 'unknown',
					message: 'An error occurred while loading the recording. Please try again later.'
				}
			};
		}
	}
}
