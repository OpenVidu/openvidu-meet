import { Injectable, inject } from '@angular/core';
import { NavigationService, RecordingEntryService, type RecordingEntryParams } from '@openvidu-meet/shared-components';
import { lastPathSegment, queryParam } from '../../utils/url';
import type { ModeInputs } from '../mode';
import type { ModeBootstrapResult, ModeBootstrapper } from './bootstrapper';

@Injectable({ providedIn: 'root' })
export class SingleRecordingModeBootstrapper implements ModeBootstrapper {
	private readonly recordingEntryService = inject(RecordingEntryService);
	private readonly navigationService = inject(NavigationService);

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
					// Show the login view in-shell, like the meeting flow (the SPA guard
					// equivalent calls `redirectToLoginPage`). The returned error is
					// suppressed by the shell while the login request is active; once the
					// user signs in, the recording bootstrap is retried.
					await this.navigationService.redirectToLoginPage();
					return {
						kind: 'error',
						detail: {
							reason: 'auth-required',
							message: 'Authentication is required to view this recording.'
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
