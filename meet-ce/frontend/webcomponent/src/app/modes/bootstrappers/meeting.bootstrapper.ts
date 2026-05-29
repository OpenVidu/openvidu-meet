import { Injectable, inject } from '@angular/core';
import { MeetingEntryService, type MeetingEntryParams } from '@openvidu-meet/shared-components';
import { lastPathSegment, queryParam } from '../../utils/url';
import type { ModeInputs } from '../mode';
import type { ModeBootstrapResult, ModeBootstrapper } from './bootstrapper';

@Injectable({ providedIn: 'root' })
export class MeetingModeBootstrapper implements ModeBootstrapper {
	private readonly meetingEntryService = inject(MeetingEntryService);

	async bootstrap(inputs: ModeInputs): Promise<ModeBootstrapResult> {
		const url = inputs.roomUrl;
		const roomId = lastPathSegment(url);

		if (!roomId) {
			return {
				kind: 'error',
				detail: {
					reason: 'invalid-room-url',
					message: `Invalid room URL: "${url}". Cannot extract room ID.`
				}
			};
		}

		const params: MeetingEntryParams = {
			roomId,
			secret: queryParam(url, 'secret') || undefined,
			e2eeKey: inputs.e2eeKey || undefined,
			e2eeKeyFromUrl: inputs.e2eeKey ? true : undefined,
			participantName: inputs.participantName || undefined,
			participantNameFromUrl: inputs.participantName ? true : undefined,
			leaveRedirectUrl: inputs.leaveRedirectUrl || undefined
		};

		try {
			const outcome = await this.meetingEntryService.attempt(params);

			switch (outcome.kind) {
				case 'ready':
				case 'redirect':
					return { kind: 'ready' };
				case 'error':
					return {
						kind: 'error',
						detail: {
							reason: 'access-denied',
							message: 'Unable to prepare your meeting. Please check the room URL and try again.',
							accessReason: outcome.reason
						}
					};
			}
		} catch {
			return {
				kind: 'error',
				detail: {
					reason: 'unknown',
					message: 'An error occurred while preparing your meeting. Please try again later.'
				}
			};
		}
	}
}
