import { expect, type Page } from '@playwright/test';
import { hoverStream } from './ui-utils.helper';

// ─── Remote stream waiting ──────────────────────────────────────────────────

/**
 * Waits until the expected number of remote streams are visible **and** the
 * specified number have playable video tracks.
 *
 * @param count   - Total visible remote streams expected.
 * @param options.requireAudioTracks - Also require live audio tracks.
 * @param options.videoCount - How many of the streams must have playable video.
 *   Defaults to {@link count} (all). Use a lower value when some participants
 *   have their camera off.
 */
export const waitForRemoteStream = async (
	page: Page,
	count = 1,
	options?: { requireAudioTracks?: boolean; videoCount?: number }
): Promise<void> => {
	const expectedVideoCount = options?.videoCount ?? count;

	await expect
		.poll(
			async () =>
				await page.evaluate((requireAudioTracks) => {
					const remoteStreams = Array.from(document.querySelectorAll('.OV_stream.remote')) as HTMLElement[];
					const visibleRemoteStreams = remoteStreams.filter((stream) => {
						const rect = stream.getBoundingClientRect();
						const style = window.getComputedStyle(stream);
						return (
							rect.width > 0 &&
							rect.height > 0 &&
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							style.opacity !== '0' &&
							!stream.classList.contains('no-size')
						);
					});

					const playableRemoteVideos = visibleRemoteStreams.filter((stream) => {
						const video = stream.querySelector('video') as HTMLVideoElement | null;

						if (
							!video ||
							!video.srcObject ||
							video.paused ||
							video.readyState < 2 ||
							video.videoWidth <= 0
						) {
							return false;
						}

						const mediaStream = video.srcObject as MediaStream;
						const liveVideoTracks = mediaStream
							.getVideoTracks()
							.filter((track) => track.readyState === 'live');
						const liveAudioTracks = mediaStream
							.getAudioTracks()
							.filter((track) => track.readyState === 'live');

						return liveVideoTracks.length > 0 && (!requireAudioTracks || liveAudioTracks.length > 0);
					});

					return {
						visibleRemoteStreams: visibleRemoteStreams.length,
						playableRemoteVideos: playableRemoteVideos.length
					};
				}, options?.requireAudioTracks ?? false),
			{ timeout: 15_000 }
		)
		.toEqual({ visibleRemoteStreams: count, playableRemoteVideos: expectedVideoCount });
};

// ─── Remote participant name helpers ────────────────────────────────────────

/**
 * Returns the deduplicated display names of all visible remote participants.
 */
export const getVisibleRemoteParticipantNames = async (page: Page): Promise<string[]> => {
	return await page.evaluate(() => {
		const names = Array.from(document.querySelectorAll('.OV_stream_video.remote'))
			.filter((stream) => {
				const element = stream as HTMLElement;
				const rect = element.getBoundingClientRect();
				const style = window.getComputedStyle(element);
				return (
					rect.width > 0 &&
					rect.height > 0 &&
					style.display !== 'none' &&
					style.visibility !== 'hidden' &&
					style.opacity !== '0' &&
					!element.classList.contains('no-size')
				);
			})
			.map((stream) => stream.querySelector('#participant-name-container')?.textContent?.trim() ?? '')
			.filter((name) => name.length > 0);

		return [...new Set(names)];
	});
};

/**
 * Polls until the visible remote participant names satisfy the given constraints
 * (count, includes, excludes).
 */
export const waitForVisibleRemoteParticipants = async (
	page: Page,
	options: { includes?: string[]; excludes?: string[]; count?: number },
	timeout = 20_000
): Promise<void> => {
	await expect
		.poll(
			async () => {
				const names = await getVisibleRemoteParticipantNames(page);

				return {
					matchesCount: options.count === undefined || names.length === options.count,
					matchesIncludes: (options.includes ?? []).every((name) => names.includes(name)),
					matchesExcludes: (options.excludes ?? []).every((name) => !names.includes(name))
				};
			},
			{ timeout }
		)
		.toEqual({
			matchesCount: true,
			matchesIncludes: true,
			matchesExcludes: true
		});
};

// ─── Element count assertions ───────────────────────────────────────────────

/**
 * Asserts the total number of `<video>` elements on the page.
 */
export const expectVideoCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('video')).toHaveCount(count);
};

/**
 * Asserts the number of publisher stream containers.
 */
export const expectStreamCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.OV_publisher .OV_stream')).toHaveCount(count);
};

/**
 * Asserts the number of screen-share stream elements.
 */
export const expectScreenShareCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.OV_screen')).toHaveCount(count);
};

/**
 * Asserts the number of `.screen-source` elements.
 */
export const expectScreenSourceCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.OV_video-element.screen-source')).toHaveCount(count, { timeout: 10_000 });
};

/**
 * Asserts expected counts for local video and/or audio elements.
 */
export const expectLocalStreamCount = async (page: Page, counts: { video?: number; audio?: number }): Promise<void> => {
	if (counts.video !== undefined) {
		await expect(page.locator('.OV_stream.local .OV_video-element')).toHaveCount(counts.video);
		await expect(page.locator('video')).toHaveCount(counts.video);
	}

	if (counts.audio !== undefined) {
		await expect(page.locator('.OV_stream.local .OV_audio-element')).toHaveCount(counts.audio);
		await expect(page.locator('audio')).toHaveCount(counts.audio);
	}
};

// ─── Pinning ────────────────────────────────────────────────────────────────

/**
 * Asserts the number of currently-pinned streams.
 */
export const expectPinnedStreamCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.OV_big .OV_stream')).toHaveCount(count, { timeout: 10_000 });
};

/**
 * Returns the number of currently-pinned streams.
 */
export const getPinnedStreamCount = async (page: Page): Promise<number> => {
	return await page.locator('.OV_big .OV_stream').count();
};

/**
 * Pins a stream by clicking on the element matching {@link selector} and then
 * clicking the pin button that appears.
 */
export const toggleStreamPin = async (page: Page, selector: string, timeoutMs = 10_000): Promise<void> => {
	const target = page.locator(selector).first();
	await target.click({ force: true });

	const stream = target.locator('xpath=ancestor::*[contains(@class,"OV_stream")]').first();
	const streamPinButton = stream.locator('#pin-btn').first();

	if (await streamPinButton.isVisible()) {
		await streamPinButton.click();
	} else {
		await page.locator('#pin-btn').first().click();
	}

	await expect(page.locator('.OV_big .OV_stream').first()).toBeVisible({ timeout: timeoutMs });
};

/**
 * Unpins the currently-pinned stream by clicking it and toggling the pin button.
 */
export const unpinCurrentPinnedStream = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	const pinnedStream = page.locator('.OV_big').first();
	await pinnedStream.click({ force: true });

	const pinnedButton = pinnedStream.locator('#pin-btn').first();

	if (await pinnedButton.isVisible()) {
		await pinnedButton.click();
	} else {
		await page.locator('#pin-btn').first().click();
	}

	await expect(page.locator('.OV_big .OV_stream')).toHaveCount(0, { timeout: timeoutMs });
};

// ─── Track label inspection ──────────────────────────────────────────────────

/**
 * Returns the label of the first video track on the page, or `null` if none exists.
 */
export const getFirstVideoTrackLabel = async (page: Page): Promise<string | null> => {
	return await page.evaluate(() => {
		const video = document.querySelector('video') as HTMLVideoElement | null;
		const stream = video?.srcObject as MediaStream | null;
		const track = stream?.getVideoTracks()?.[0];
		return track?.label ?? null;
	});
};

/**
 * Returns the label of the screen-share video track, or `null` if none exists.
 */
export const getScreenTrackLabel = async (page: Page): Promise<string | null> => {
	return await page.evaluate(() => {
		const screenVideo = document.querySelector('.OV_video-element.screen-source') as HTMLVideoElement | null;
		const stream = screenVideo?.srcObject as MediaStream | null;
		const track = stream?.getVideoTracks()?.[0];
		return track?.label ?? null;
	});
};

// ─── Screen-source track inspection ─────────────────────────────────────────

/**
 * Returns metadata for every track inside the first `.screen-source` video element.
 */
export const getScreenSourceTracks = async (
	page: Page
): Promise<Array<{ kind: string; enabled: boolean; id: string; label: string }>> => {
	return await page.evaluate(() => {
		const video = document.querySelector('.OV_video-element.screen-source') as HTMLVideoElement | null;

		if (!video || !video.srcObject) {
			return [];
		}

		const stream = video.srcObject as MediaStream;

		return stream.getTracks().map((track: MediaStreamTrack) => ({
			kind: track.kind,
			enabled: track.enabled,
			id: track.id,
			label: track.label
		}));
	});
};

// ─── Stream layout (minimize / maximize / drag) ─────────────────────────────

/**
 * Minimizes the local stream by hovering and clicking the minimize button.
 */
export const minimizeStream = async (page: Page): Promise<void> => {
	await hoverStream(page, '.OV_publisher .OV_stream_video.local');
	await expect(page.locator('#minimize-btn')).toBeVisible();
	await page.locator('#minimize-btn').click();
};

/**
 * Maximizes (restores) the local stream by hovering and clicking the
 * minimize/maximize toggle button.
 */
export const maximizeStream = async (page: Page): Promise<void> => {
	await hoverStream(page, '.local_participant .OV_stream_video.local');
	await expect(page.locator('#minimize-btn')).toBeVisible();
	await page.locator('#minimize-btn').click();
};

/**
 * Drags a stream element to a new viewport position.
 */
export const dragStream = async (page: Page, selector: string, targetX: number, targetY: number): Promise<void> => {
	const element =
		selector === '.local_participant'
			? page.locator('.local_participant:has(.OV_stream_video.local)').first()
			: page.locator(selector).first();

	await expect(element).toBeVisible({ timeout: 5_000 });
	const box = await element.boundingBox();

	if (!box) {
		throw new Error('Element not found for dragging');
	}

	await element.hover();
	await page.mouse.down();
	await page.mouse.move(targetX, targetY, { steps: 10 });
	await page.mouse.up();
};
