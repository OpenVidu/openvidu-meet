import type { Locator, Page } from '@playwright/test';
import { createRoom, createRoomAndGetAccessUrl } from './meet-api.helper';

export async function createCaptionsAccessUrlWithRoomConfig(params: {
	participantName: string;
	captionsEnabledInRoom: boolean;
	createdRoomIds: Set<string>;
	queryParams?: Record<string, string>;
}): Promise<string> {
	const room = await createRoom({
		roomName: `captions-${Date.now()}`,
		config: {
			captions: {
				enabled: params.captionsEnabledInRoom
			}
		}
	});

	const { accessUrl } = await createRoomAndGetAccessUrl(
		params.participantName,
		room,
		params.queryParams ?? { prejoin: 'false' },
		params.createdRoomIds
	);

	return accessUrl;
}

export function getCaptionsButton(page: Page): Locator {
	return page.locator('#captions-button').first();
}

export function getCaptionsButtonIcon(page: Page): Locator {
	return page.locator('#captions-button mat-icon').first();
}
