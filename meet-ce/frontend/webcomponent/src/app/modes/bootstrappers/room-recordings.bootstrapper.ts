import { Injectable, inject } from '@angular/core';
import { RoomRecordingsEntryService, type RoomRecordingsEntryParams } from '@openvidu-meet/shared-components';
import type { WebComponentPropertyValues } from '@openvidu-meet/typings';
import { lastPathSegment, queryParam } from '../../utils/url';
import type { ModeBootstrapResult, ModeBootstrapper } from './bootstrapper';

@Injectable({ providedIn: 'root' })
export class RoomRecordingsModeBootstrapper implements ModeBootstrapper {
	private readonly roomRecordingsEntryService = inject(RoomRecordingsEntryService);

	async bootstrap(inputs: Required<WebComponentPropertyValues>): Promise<ModeBootstrapResult> {
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

		const params: RoomRecordingsEntryParams = {
			roomId,
			secret: queryParam(url, 'secret') || undefined
		};

		try {
			const outcome = await this.roomRecordingsEntryService.attempt(params);

			switch (outcome.kind) {
				case 'ready':
					return { kind: 'ready' };
				case 'error':
					return {
						kind: 'error',
						detail: {
							reason: 'access-denied',
							message: 'Unable to load this room’s recordings. Please check the room URL and try again.',
							accessReason: outcome.reason
						}
					};
			}
		} catch {
			return {
				kind: 'error',
				detail: {
					reason: 'unknown',
					message: 'An error occurred while loading the room’s recordings. Please try again later.'
				}
			};
		}
	}
}
