import type { Locator, Page } from '@playwright/test';
import { createExternalRoomMember, createRoom, toAbsoluteMeetUrl } from './meet-api.helper';

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
	params.createdRoomIds.add(room.roomId);

	const member = await createExternalRoomMember({
		roomId: room.roomId,
		name: params.participantName,
		baseRole: 'moderator'
	});

	const accessUrl = new URL(toAbsoluteMeetUrl(member.accessUrl));

	for (const [key, value] of Object.entries(params.queryParams ?? { prejoin: 'false' })) {
		accessUrl.searchParams.set(key, value);
	}

	return accessUrl.toString();
}

export function getCaptionsButton(page: Page): Locator {
	return page.locator('#captions-button').first();
}

export function getCaptionsButtonIcon(page: Page): Locator {
	return page.locator('#captions-button mat-icon').first();
}
