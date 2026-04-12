import { type Page, expect } from '@playwright/test';
import { createRoomAndGetAccessUrl, deleteRooms } from './meet-api.helper';

const createdRoomIds = new Set<string>();

export async function createMediaDevicesAccessUrl(
	participantName: string,
	queryParams?: Record<string, string>
): Promise<string> {
	const { room, accessUrl } = await createRoomAndGetAccessUrl(participantName, undefined, queryParams);
	createdRoomIds.add(room.roomId);
	return accessUrl;
}

export async function cleanupMediaDevicesRooms(): Promise<void> {
	await deleteRooms(createdRoomIds);
	createdRoomIds.clear();
}

export async function getFirstVideoTrackLabel(page: Page): Promise<string | null> {
	return await page.evaluate(() => {
		const video = document.querySelector('video') as HTMLVideoElement | null;
		const stream = video?.srcObject as MediaStream | null;
		const track = stream?.getVideoTracks()?.[0];
		return track?.label ?? null;
	});
}

export async function getScreenTrackLabel(page: Page): Promise<string | null> {
	return await page.evaluate(() => {
		const screenVideo = document.querySelector('.OV_video-element.screen-type') as HTMLVideoElement | null;
		const stream = screenVideo?.srcObject as MediaStream | null;
		const track = stream?.getVideoTracks()?.[0];
		return track?.label ?? null;
	});
}

export async function assertHasVideoDeviceOption(page: Page): Promise<void> {
	await expect(page.locator('[id^="option-"]').first()).toBeVisible();
}
