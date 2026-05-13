import type { Locator, Page } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl } from './meet-api.helper';

export const createCaptionsRoom = async (params: {
	enableCaptions: boolean;
	createdRoomIds: Set<string>;
}): Promise<string> => {
	const roomOptions = {
		config: {
			captions: {
				enabled: params.enableCaptions
			}
		}
	};

	const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl(roomOptions);
	params.createdRoomIds.add(room.roomId);
	return accessUrl;
}

export const getCaptionsButton = (page: Page): Locator => {
	return page.locator('#captions-button').first();
}

export const getCaptionsButtonIcon = (page: Page): Locator => {
	return page.locator('#captions-button mat-icon').first();
}
