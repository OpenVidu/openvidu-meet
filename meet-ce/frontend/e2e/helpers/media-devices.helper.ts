import { type Page, expect } from '@playwright/test';

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
