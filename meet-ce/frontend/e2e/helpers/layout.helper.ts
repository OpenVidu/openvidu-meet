import { expect, type Page } from '@playwright/test';
import { toggleMicrophone } from './media-controls.helper';
import { openLayoutSettingsPanel } from './panels.helper';
import { waitForVisibleRemoteParticipants } from './stream.helper';

/**
 * Selects the mosaic layout radio button.
 */
export const selectMosaicLayout = async (page: Page): Promise<void> => {
	if (!(await page.locator('.settings-container').isVisible())) {
		await openLayoutSettingsPanel(page);
	}

	await page.locator('#layout-mosaic').click();
};

/**
 * Selects the smart mosaic layout radio button.
 */
export const selectSmartMosaicLayout = async (page: Page): Promise<void> => {
	if (!(await page.locator('.settings-container').isVisible())) {
		await openLayoutSettingsPanel(page);
	}

	await page.locator('#layout-smart-mosaic').click();
};

/**
 * Sets the Smart Mosaic participant count slider to a specific value.
 * @param targetValue - Target participant count (1-6)
 */
export const setSmartMosaicSliderValue = async (page: Page, targetValue: number): Promise<void> => {
	if (!(await page.locator('.settings-container').isVisible())) {
		await openLayoutSettingsPanel(page);
	}

	const sliderInput = page.locator('.participant-slider input[matSliderThumb]');
	const participantCountValue = page.locator('.participant-count-container .participant-count-value');
	await expect(sliderInput).toBeVisible();
	await sliderInput.focus();
	await sliderInput.fill(targetValue.toString());
	await expect(participantCountValue).toHaveText(String(targetValue), { timeout: 5_000 });
};

/**
 * Runs `cycles` speaker-rotation rounds between two participants while a screen share is active.
 *
 * Each round:
 *  1. Asserts the current active speaker (and the screen share) are visible and the silent one is hidden.
 *  2. Swaps microphones so the next round starts with the roles reversed.
 *
 * After all rounds a final assertion checks the expected resting state.
 *
 * @param pageA           - Observer page that renders the layout.
 * @param byName          - Map of participant name → Playwright Page.
 * @param speakerA        - Name of the first participant (active in even cycles).
 * @param speakerB        - Name of the second participant (active in odd cycles).
 * @param screenOwner     - Name of the participant sharing their screen (used to derive the screen-share track name).
 * @param cycles          - Number of swap cycles to perform (default 3).
 */
export const runScreenShareRotationCycles = async (
	pageA: Page,
	byName: Record<string, Page>,
	speakerA: string,
	speakerB: string,
	screenOwner: string,
	cycles = 3
): Promise<void> => {
	const screenTrack = `${screenOwner} (screen)`;

	// Both participants start muted; enable speakerA to begin the first cycle.
	await toggleMicrophone(byName[speakerA]);

	for (let cycle = 0; cycle < cycles; cycle++) {
		const activeSpeaker = cycle % 2 === 0 ? speakerA : speakerB;
		const silentParticipant = cycle % 2 === 0 ? speakerB : speakerA;

		await waitForVisibleRemoteParticipants(
			pageA,
			{
				count: 2,
				includes: [activeSpeaker, screenTrack],
				excludes: [silentParticipant]
			},
			20_000
		);

		// Swap microphones: mute the active speaker and unmute the silent one.
		await Promise.all([toggleMicrophone(byName[activeSpeaker]), toggleMicrophone(byName[silentParticipant])]);
	}
};

/** Box of a video the grid lays out, with the intrinsic size of the track it is showing. */
export interface GridVideoFraming {
	left: number;
	top: number;
	width: number;
	height: number;
	videoWidth: number;
	videoHeight: number;
}

/**
 * Measures the videos the grid is laying out. The floating local tile keeps its own geometry and is
 * left out, the same way the layout engine skips it.
 */
export const getGridVideoFraming = async (page: Page): Promise<GridVideoFraming[]> =>
	page.$$eval('#layout > *:not(.OV_ignored):not(.OV_floating) video.OV_video-element', (videos) =>
		videos.map((video) => {
			const { left, top, width, height } = video.getBoundingClientRect();

			return {
				left,
				top,
				width,
				height,
				videoWidth: (video as HTMLVideoElement).videoWidth,
				videoHeight: (video as HTMLVideoElement).videoHeight
			};
		})
	);

/**
 * Gap between the pinned tile and the strip of the others, along the axis that splits them. A tight
 * layout leaves none: the room the pinned tile cannot fill belongs to the strip.
 */
export const gapBesidePinnedTile = (tiles: GridVideoFraming[]): number => {
	const pinned = tiles.reduce((widest, tile) => (tile.width > widest.width ? tile : widest), tiles[0]);
	const others = tiles.filter((tile) => tile !== pinned);
	const besidePinned = others.every((tile) => tile.left >= pinned.left + pinned.width - 1);

	return besidePinned
		? Math.min(...others.map((tile) => tile.left)) - (pinned.left + pinned.width)
		: Math.min(...others.map((tile) => tile.top)) - (pinned.top + pinned.height);
};

/**
 * Share of the camera that `object-fit: cover` cuts away to fill the tile: a tile taller than the
 * camera loses its sides, a wider one loses its top and bottom.
 */
export const croppedShare = ({ width, height, videoWidth, videoHeight }: GridVideoFraming): number => {
	const tileRatio = height / width;
	const cameraRatio = videoHeight / videoWidth;

	return tileRatio > cameraRatio ? 1 - cameraRatio / tileRatio : 1 - tileRatio / cameraRatio;
};

interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Tiles of the grid as the participant sees them, with the box of the grid around them. */
export const getGridTiles = async (page: Page): Promise<{ grid: Box; tiles: Box[] }> =>
	page.evaluate(() => {
		const box = (element: Element) => {
			const { left, top, right, bottom } = element.getBoundingClientRect();
			return { left, top, right, bottom };
		};

		return {
			grid: box(document.querySelector('#layout')!),
			tiles: [...document.querySelectorAll('#layout > *:not(.OV_ignored):not(.OV_floating) .OV_stream')].map(box)
		};
	});

/**
 * How the tiles share the grid: the gap from each tile to the next one on its right and below it,
 * the tiles that overlap another, and the ones that cross the edge of the grid.
 */
export const tileSpacing = ({ grid, tiles }: { grid: Box; tiles: Box[] }) => {
	const overlap = (a: number, b: number, c: number, d: number) => Math.min(b, d) - Math.max(a, c);
	const nearest = (gaps: number[]) => (gaps.length > 0 ? [Math.min(...gaps)] : []);

	return {
		gaps: tiles.flatMap((a) => [
			...nearest(
				tiles
					.filter((b) => b.left >= a.right - 1 && overlap(a.top, a.bottom, b.top, b.bottom) > 0)
					.map((b) => b.left - a.right)
			),
			...nearest(
				tiles
					.filter((b) => b.top >= a.bottom - 1 && overlap(a.left, a.right, b.left, b.right) > 0)
					.map((b) => b.top - a.bottom)
			)
		]),
		overlapping: tiles.filter((a) =>
			tiles.some(
				(b) =>
					b !== a &&
					overlap(a.left, a.right, b.left, b.right) > 1 &&
					overlap(a.top, a.bottom, b.top, b.bottom) > 1
			)
		).length,
		outside: tiles.filter(
			(tile) =>
				tile.left < grid.left - 1 ||
				tile.top < grid.top - 1 ||
				tile.right > grid.right + 1 ||
				tile.bottom > grid.bottom + 1
		).length
	};
};

/** Share of the grid that the tile of the named participant covers. */
export const gridShareOf = async (page: Page, name: string): Promise<number> =>
	page.evaluate((participant) => {
		const grid = document.querySelector('#layout')!.getBoundingClientRect();
		const tile = [...document.querySelectorAll('#layout .OV_stream')].find(
			(stream) => stream.querySelector('#participant-name')?.textContent?.trim() === participant
		);

		if (!tile) return 0;

		const { width, height } = tile.getBoundingClientRect();
		return (width * height) / (grid.width * grid.height);
	}, name);

/** Simulcast layers of a camera as LiveKit publishes them: 180p, 360p and the capture resolution. */
export type CameraLayer = 'low' | 'medium' | 'high';

/** Layer a received camera video belongs to, from the height it arrives at. */
export const cameraLayerOf = (videoHeight: number): CameraLayer =>
	videoHeight <= 180 ? 'low' : videoHeight <= 360 ? 'medium' : 'high';

/**
 * Smallest layer that covers a tile of this height in CSS pixels. The SFU answers a request with the
 * lowest layer that reaches 90% of the height asked for.
 */
export const cameraLayerCovering = (tileHeight: number): CameraLayer => cameraLayerOf(tileHeight * 0.9);

/** Box of the shared screen inside the grid, with the size of the layout container around it. */
export interface SharedScreenFraming {
	width: number;
	height: number;
	videoWidth: number;
	videoHeight: number;
	containerWidth: number;
	containerHeight: number;
}

export const getSharedScreenFraming = async (page: Page): Promise<SharedScreenFraming | null> =>
	page.evaluate(() => {
		const video = document.querySelector<HTMLVideoElement>(
			'#layout > *:not(.OV_ignored):not(.OV_floating) .screen-source video.OV_video-element, ' +
				'#layout > *.OV_screen:not(.OV_ignored):not(.OV_floating) video.OV_video-element'
		);
		const container = document.querySelector<HTMLElement>('#layout');

		if (!video || !container) return null;

		const box = video.getBoundingClientRect();
		const containerBox = container.getBoundingClientRect();

		return {
			width: box.width,
			height: box.height,
			videoWidth: video.videoWidth,
			videoHeight: video.videoHeight,
			containerWidth: containerBox.width,
			containerHeight: containerBox.height
		};
	});

/**
 * How much of the room the container allows the shared screen actually uses. `object-fit: contain`
 * paints it at the largest size that fits its box, so this compares that width against the width it
 * would reach with the whole container to itself.
 */
export const paintedShareOfContainer = ({
	width,
	height,
	videoWidth,
	videoHeight,
	containerWidth,
	containerHeight
}: SharedScreenFraming): number => {
	const contentRatio = videoHeight / videoWidth;
	const paintedWidth = (boxWidth: number, boxHeight: number) =>
		boxHeight / boxWidth > contentRatio ? boxWidth : boxHeight / contentRatio;

	return paintedWidth(width, height) / paintedWidth(containerWidth, containerHeight);
};
