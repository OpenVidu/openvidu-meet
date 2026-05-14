import { type Page, expect } from '@playwright/test';

export const getFirstVideoTrackLabel = async (page: Page): Promise<string | null> => {
	return await page.evaluate(() => {
		const video = document.querySelector('video') as HTMLVideoElement | null;
		const stream = video?.srcObject as MediaStream | null;
		const track = stream?.getVideoTracks()?.[0];
		return track?.label ?? null;
	});
}

export const getScreenTrackLabel = async (page: Page): Promise<string | null> => {
	return await page.evaluate(() => {
		const screenVideo = document.querySelector('.OV_video-element.screen-source') as HTMLVideoElement | null;
		const stream = screenVideo?.srcObject as MediaStream | null;
		const track = stream?.getVideoTracks()?.[0];
		return track?.label ?? null;
	});
}

export const assertHasVideoDeviceOption = async (page: Page): Promise<void> => {
	await expect(page.locator('[id^="option-"]').first()).toBeVisible();
}
