import { expect, type Locator, type Page } from '@playwright/test';
import { hoverStream } from './ui-utils.helper';

/**
 * Polls the bounding box of {@link locator} until it stops moving / resizing or
 * the timeout elapses. Used to gate clicks on tiles that are mid-reflow (e.g. the
 * settings panel just closed, or the smart-layout slider just changed): without
 * this, the click target keeps reporting "element is not stable" or detaches
 * from the DOM right when the click is dispatched.
 */
const waitForBoundingBoxStable = async (
	locator: Locator,
	{
		samples = 4,
		intervalMs = 100,
		timeoutMs = 5_000
	}: { samples?: number; intervalMs?: number; timeoutMs?: number } = {}
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	let stableHits = 0;
	let prev = await locator.boundingBox();

	while (Date.now() < deadline) {
		await locator.page().waitForTimeout(intervalMs);
		const next = await locator.boundingBox();

		const matches =
			!!prev &&
			!!next &&
			Math.abs(prev.x - next.x) < 1 &&
			Math.abs(prev.y - next.y) < 1 &&
			Math.abs(prev.width - next.width) < 1 &&
			Math.abs(prev.height - next.height) < 1;

		stableHits = matches ? stableHits + 1 : 0;
		prev = next;

		if (stableHits >= samples) return;
	}
};

// ─── Remote stream waiting ──────────────────────────────────────────────────

/**
 * Waits until the expected number of remote streams are visible, the specified
 * number have playable video tracks, and the expected number of remote audio
 * elements are mounted (hidden) in the persistent audio layer.
 *
 * Audio is no longer attached to the `<video>` element — `SmartLayoutComponent`
 * mounts a dedicated `<audio data-participant data-source>` per remote audio
 * track inside a `[hidden]` container so playback survives layout changes and
 * works on Safari. We assert those elements exist with live tracks.
 *
 * @param count   - Total visible remote streams expected.
 * @param options.videoCount - How many of the streams must have playable video.
 *   Defaults to {@link count}. Lower when some participants have camera off.
 * @param options.audioCount - How many hidden remote `<audio>` elements with
 *   live tracks are expected. Defaults to {@link count}. Override for cases
 *   where audio and visible-stream counts diverge (e.g. screen-share without
 *   audio, or a remote with mic off).
 */
export const waitForRemoteStream = async (
	page: Page,
	count = 1,
	options?: { videoCount?: number; audioCount?: number }
): Promise<void> => {
	const expectedVideoCount = options?.videoCount ?? count;
	const expectedAudioCount = options?.audioCount ?? count;

	await expect
		.poll(
			async () =>
				await page.evaluate(() => {
					const remoteStreams = Array.from(document.querySelectorAll('.OV_stream.remote')) as HTMLElement[];
					const visibleRemoteStreams = remoteStreams.filter((stream) => {
						const rect = stream.getBoundingClientRect();
						const style = window.getComputedStyle(stream);
						return (
							rect.width > 0 &&
							rect.height > 0 &&
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							style.opacity !== '0'
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

						return liveVideoTracks.length > 0;
					});

					const audioElements = Array.from(
						document.querySelectorAll('audio[data-participant]')
					) as HTMLAudioElement[];
					const hiddenLiveRemoteAudios = audioElements.filter((audio) => {
						if (!audio.closest('[hidden]')) return false;

						const stream = audio.srcObject as MediaStream | null;

						if (!stream) return false;

						return stream.getAudioTracks().some((track) => track.readyState === 'live');
					});

					return {
						visibleRemoteStreams: visibleRemoteStreams.length,
						playableRemoteVideos: playableRemoteVideos.length,
						hiddenLiveRemoteAudios: hiddenLiveRemoteAudios.length
					};
				}),
			{ timeout: 15_000 }
		)
		.toEqual({
			visibleRemoteStreams: count,
			playableRemoteVideos: expectedVideoCount,
			hiddenLiveRemoteAudios: expectedAudioCount
		});
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
					style.opacity !== '0'
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

// ─── Persistent audio layer ─────────────────────────────────────────────────

/**
 * Returns the number of `<audio data-participant>` elements in the hidden
 * audio container that currently have `muted === true`.
 */
export const countMutedRemoteAudios = async (page: Page): Promise<number> => {
	return await page.evaluate(() => {
		const audios = Array.from(document.querySelectorAll('audio[data-participant]')) as HTMLAudioElement[];

		return audios.filter((a) => a.muted).length;
	});
};

// ─── Pinning ────────────────────────────────────────────────────────────────

/**
 * Asserts the number of currently-pinned streams.
 */
export const expectPinnedStreamCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.OV_big .OV_stream')).toHaveCount(count, { timeout: 10_000 });
};

/**
 * Toggles the pin state of a stream by clicking on the element matching {@link selector}
 * and then clicking the pin/unpin button that appears.
 * Automatically detects whether the stream is currently pinned and clicks the appropriate button.
 */
export const toggleStreamPin = async (page: Page, selector: string, timeoutMs = 10_000): Promise<void> => {
	const target = page.locator(selector).first();
	await target.waitFor({ state: 'visible', timeout: timeoutMs });

	// Tests routinely call this right after closing the settings panel or moving the
	// smart-mosaic slider — both of which trigger layout reflows that keep moving the
	// tile (and re-mounting its inner controls) for a few hundred ms. Without a settle
	// wait, the click reports "element is not stable" repeatedly and eventually
	// "element was detached from the DOM".
	await waitForBoundingBoxStable(target);

	await target.hover();

	// Scope pin/unpin lookup to the target stream — `#pin-btn` is duplicated
	// across streams, and an unrelated (e.g. local) stream's button may be
	// momentarily visible.
	const pinButton = target.locator('#pin-btn');
	const unpinButton = target.locator('#unpin-btn');

	await expect(pinButton.or(unpinButton)).toBeVisible({ timeout: timeoutMs });

	const willPin = await pinButton.isVisible();
	const buttonToClick = willPin ? pinButton : unpinButton;

	// Re-hover immediately before the click. Between the visibility check and the
	// click, the stream-component's HOVER_TIMEOUT (2s) can elapse and hide the
	// controls — re-hovering keeps the button in the DOM long enough to land the click.
	await target.hover();
	await buttonToClick.click();

	if (willPin) {
		await expect(page.locator('.OV_big .OV_stream').first()).toBeVisible({ timeout: timeoutMs });
	} else {
		await expect(page.locator('.OV_big .OV_stream')).toHaveCount(0, { timeout: timeoutMs });
	}
};

/**
 * Unpins the currently-pinned stream by clicking it and toggling the pin button.
 */
export const unpinCurrentPinnedStream = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	const pinnedStream = page.locator('.OV_big').first();
	await pinnedStream.click({ force: true });

	const unpinButton = pinnedStream.locator('#unpin-btn').first();
	await expect(unpinButton).toBeVisible({ timeout: timeoutMs });
	await unpinButton.click();
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
 * Returns the `deviceId` actually backing the first video track on the page, or `null` if none
 * exists. Unlike the track label, the deviceId is a stable identifier for the underlying camera and
 * is what device-selection comparisons should key on.
 */
export const getFirstVideoTrackDeviceId = async (page: Page): Promise<string | null> => {
	return await page.evaluate(() => {
		const video = document.querySelector('video') as HTMLVideoElement | null;
		const stream = video?.srcObject as MediaStream | null;
		const track = stream?.getVideoTracks()?.[0];
		return track?.getSettings?.().deviceId ?? null;
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

// ─── Stream layout (float / dock / drag) ─────────────────────────────

/** The local camera tile, whose `OV_floating` class tells float from dock. */
export const localCameraStream = (page: Page): Locator =>
	page.locator('.local_participant:has(.OV_stream_video.local)').first();

/**
 * Floats the local stream by hovering and clicking the float button.
 */
export const floatStream = async (page: Page): Promise<void> => {
	await hoverStream(page, '.OV_publisher .OV_stream_video.local');
	await expect(page.locator('#float-btn')).toBeVisible();
	await page.locator('#float-btn').click();
	await expect(localCameraStream(page)).toHaveClass(/OV_floating/);
};

/**
 * Docks (restores) the local stream by hovering and clicking the
 * float/dock toggle button.
 */
export const dockStream = async (page: Page): Promise<void> => {
	await hoverStream(page, '.local_participant .OV_stream_video.local');
	await expect(page.locator('#float-btn')).toBeVisible();
	await page.locator('#float-btn').click();
	await expect(localCameraStream(page)).not.toHaveClass(/OV_floating/);
};

/**
 * Drags a resize handle on the floating local video by the given pixel delta.
 * {@link handleClass} should be one of: resize-se, resize-sw, resize-ne, resize-nw.
 */
export const resizeStream = async (page: Page, handleClass: string, deltaX: number, deltaY: number): Promise<void> => {
	const handle = page.locator(`.OV_floating .resize-handle.${handleClass}`).first();
	await expect(handle).toBeVisible({ timeout: 5_000 });
	const box = await handle.boundingBox();

	if (!box) throw new Error(`Resize handle .${handleClass} not found`);

	const startX = box.x + box.width / 2;
	const startY = box.y + box.height / 2;
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
	await page.mouse.up();
};

// ─── Screen-share zoom controls ─────────────────────────────────────────────

/**
 * Locator for the local screen-share stream container.
 */
export const screenShareStream = (page: Page): Locator => page.locator('.local_participant.OV_screen').first();

/**
 * Hovers the local screen-share stream so its overlay controls (pin + the zoom
 * feature group) become visible, and returns the screen-share container locator.
 *
 * Sharing your own screen pops the "share this link" panel and reflows the
 * layout, so a single `.hover()` can land while the tile is still moving and
 * never trigger the overlay. Retrying the hover until `.stream-video-controls`
 * is actually visible makes the helper robust against that reflow.
 */
export const hoverScreenShareStream = async (page: Page): Promise<Locator> => {
	const container = screenShareStream(page);
	await expect(container).toBeVisible({ timeout: 10_000 });

	const controls = container.locator('.stream-video-controls');
	await expect(async () => {
		await container.hover();
		await expect(controls).toBeVisible({ timeout: 1_000 });
	}).toPass({ timeout: 15_000 });

	return container;
};

/**
 * Reads the screen-share zoom percentage from the `#zoom-level` label. Returns
 * 100 when no label is present (i.e. the stream is at its 1x base, where the
 * label is intentionally hidden).
 */
export const readZoomPercent = async (page: Page): Promise<number> => {
	const label = screenShareStream(page).locator('#zoom-level');

	if ((await label.count()) === 0) {
		return 100;
	}

	const text = (await label.textContent())?.trim() ?? '';
	const value = Number.parseInt(text.replace('%', ''), 10);
	return Number.isNaN(value) ? 100 : value;
};

/**
 * Clicks the screen-share zoom-in button {@link times} times, verifying the
 * displayed percentage strictly increases on each step. Re-hovers and retries
 * each click because the button shifts position as the reset/zoom-out buttons
 * and the percentage label appear on the first zoom step, which can otherwise
 * race a click against the re-render.
 */
export const zoomInScreenShare = async (page: Page, times = 1): Promise<void> => {
	const container = await hoverScreenShareStream(page);
	const zoomIn = container.locator('#zoom-in-btn');

	// Thread the last confirmed percentage forward instead of re-reading a fresh
	// baseline each iteration: a fresh read can momentarily see the label detached
	// (returning 100) and let a no-op click "pass", silently dropping a step.
	let confirmed = await readZoomPercent(page);

	for (let i = 0; i < times; i += 1) {
		const previous = confirmed;

		await expect(async () => {
			await container.hover();
			await expect(zoomIn).toBeVisible({ timeout: 1_000 });
			await zoomIn.click();
			// The percentage is driven by a signal; give Angular a tick to flush the text.
			await expect.poll(() => readZoomPercent(page), { timeout: 1_000 }).toBeGreaterThan(previous);
		}).toPass({ timeout: 10_000 });

		confirmed = await readZoomPercent(page);
	}
};

/**
 * Clicks a scoped zoom control (e.g. `#zoom-out-btn`, `#reset-zoom-btn`) on the
 * screen-share stream, re-hovering first so the auto-hide timer can't remove it.
 */
export const clickZoomControl = async (page: Page, buttonId: string): Promise<void> => {
	const container = await hoverScreenShareStream(page);
	const button = container.locator(`#${buttonId}`);
	await expect(button).toBeVisible({ timeout: 5_000 });
	await button.click();
};

/**
 * Returns the ordered ids of the elements inside the screen-share zoom control
 * group, e.g. `['reset-zoom-btn', 'zoom-out-btn', 'zoom-level', 'zoom-in-btn']`.
 */
export const getZoomControlOrder = async (page: Page): Promise<string[]> => {
	const container = await hoverScreenShareStream(page);

	return await container
		.locator('.stream-video-controls .control-group > *')
		.evaluateAll((elements) => elements.map((element) => element.id).filter((id) => id.length > 0));
};

/**
 * Drags a stream element to a new viewport position.
 */
export const dragStream = async (page: Page, selector: string, targetX: number, targetY: number): Promise<void> => {
	const element = selector === '.local_participant' ? localCameraStream(page) : page.locator(selector).first();

	await expect(element).toBeVisible({ timeout: 5_000 });
	const box = await element.boundingBox();

	if (!box) {
		throw new Error('Element not found for dragging');
	}

	// Grab the tile at the TOP-CENTER edge, clear of the hover controls (tile center) and the
	// corner resize handles. Dragging is 1:1 (no transition on the CDK transform), so the grabbed
	// point stays under the pointer for the whole drag — pressing on the center would press the
	// float/pin buttons and the release would CLICK them, toggling dock instead of dragging.
	await page.mouse.move(box.x + box.width / 2, box.y + 8);
	await page.mouse.down();
	await page.mouse.move(targetX, targetY, { steps: 10 });
	await page.mouse.up();
};

// ─── Media flow ─────────────────────────────────────────────────────────────

type PeerConnectionWindow = Window & { __peerConnections?: RTCPeerConnection[] };

/** Must run before navigation: records every RTCPeerConnection so the media-flow helpers below can read its stats. */
export const capturePeerConnections = async (page: Page): Promise<void> => {
	await page.addInitScript(() => {
		const connections: RTCPeerConnection[] = [];
		(window as PeerConnectionWindow).__peerConnections = connections;
		const Original = window.RTCPeerConnection;
		window.RTCPeerConnection = class extends Original {
			constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
				super(...args);
				connections.push(this);
			}
		};
	});
};

type MediaSnapshot = {
	/** `framesReceived` of every remote video, keyed by the id of the track that carries it. */
	receivedFrames: Record<string, number>;
	/** `framesEncoded` of every local video layer. */
	encodedFrames: Record<string, number>;
	/**
	 * Remote camera and screen tiles on screen: the track their `<video>` plays, the frames it has
	 * presented, and whether it is playing an enabled live track at all.
	 */
	tiles: { label: string; trackId?: string; presentedFrames: number; isPlaying: boolean }[];
};

const snapshotMedia = (page: Page): Promise<MediaSnapshot> =>
	page.evaluate(async () => {
		const snapshot: MediaSnapshot = { receivedFrames: {}, encodedFrames: {}, tiles: [] };
		const connections = (window as PeerConnectionWindow).__peerConnections ?? [];

		for (const connection of connections.filter((c) => c.connectionState !== 'closed')) {
			(await connection.getStats()).forEach((report) => {
				if (report.type === 'inbound-rtp' && report.kind === 'video') {
					snapshot.receivedFrames[report.trackIdentifier] = report.framesReceived;
				}

				if (report.type === 'outbound-rtp' && report.kind === 'video') {
					snapshot.encodedFrames[report.id] = report.framesEncoded;
				}
			});
		}

		for (const tile of Array.from(document.querySelectorAll<HTMLElement>('.OV_stream.remote'))) {
			const box = tile.getBoundingClientRect();
			const style = window.getComputedStyle(tile);
			const isShown =
				box.width > 0 &&
				box.height > 0 &&
				style.display !== 'none' &&
				style.visibility !== 'hidden' &&
				style.opacity !== '0';

			if (!isShown) continue;

			const name = tile.querySelector('#participant-name')?.textContent?.trim() ?? '';
			const video = tile.querySelector('video');
			const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
			snapshot.tiles.push({
				label: tile.classList.contains('screen-source') ? `${name} (screen)` : name,
				trackId: track?.id,
				presentedFrames: video?.getVideoPlaybackQuality().totalVideoFrames ?? 0,
				isPlaying: !!video && !video.paused && track?.readyState === 'live' && track.enabled
			});
		}

		return snapshot;
	});

const snapshotsOneSecondApart = async (page: Page): Promise<[MediaSnapshot, MediaSnapshot]> => {
	const before = await snapshotMedia(page);
	await page.waitForTimeout(1_000);
	return [before, await snapshotMedia(page)];
};

const grownKeys = (before: Record<string, number>, after: Record<string, number>): string[] =>
	Object.keys(after).filter((key) => after[key] > (before[key] ?? 0));

/**
 * Waits until every remote tile on screen presents new frames of an enabled track and no remote video
 * arrives without a tile to show it. A frozen or black tile and a hidden camera that keeps streaming
 * both keep it waiting.
 */
export const expectOnlyVisibleRemoteVideosPlaying = async (page: Page, timeout = 10_000): Promise<void> => {
	await expect
		.poll(
			async () => {
				const [before, after] = await snapshotsOneSecondApart(page);
				const received = grownKeys(before.receivedFrames, after.receivedFrames);
				const shown = new Set(after.tiles.map((tile) => tile.trackId));
				const presentedBefore = (label: string, trackId?: string) =>
					before.tiles.find((tile) => tile.label === label && tile.trackId === trackId)?.presentedFrames ?? 0;

				return {
					stalledTiles: after.tiles
						.filter(
							(tile) =>
								!tile.isPlaying || tile.presentedFrames <= presentedBefore(tile.label, tile.trackId)
						)
						.map((tile) => tile.label),
					videosWithoutTile: received.filter((trackId) => !shown.has(trackId)).length
				};
			},
			{ timeout }
		)
		.toEqual({ stalledTiles: [], videosWithoutTile: 0 });
};

/**
 * Waits until the page is subscribed to exactly `count` remote videos, flowing or paused. Checks that a
 * hidden camera is not received only mean something once it has been subscribed. A subscribed track is
 * the only video section of the remote description that carries an `msid`: LiveKit keeps spare ones.
 */
export const waitForSubscribedRemoteVideos = async (page: Page, count: number): Promise<void> => {
	await expect
		.poll(
			() =>
				page.evaluate(
					() =>
						((window as PeerConnectionWindow).__peerConnections ?? [])
							.filter((connection) => connection.connectionState !== 'closed')
							.flatMap((connection) =>
								(connection.remoteDescription?.sdp ?? '').split(/\r?\nm=/).slice(1)
							)
							.filter((section) => section.startsWith('video') && section.includes('\na=msid:')).length
				),
			{ timeout: 20_000 }
		)
		.toBe(count);
};

/** Number of remote videos that delivered frames during a one-second window. */
export const countFlowingRemoteVideos = async (page: Page): Promise<number> => {
	const [before, after] = await snapshotsOneSecondApart(page);
	return grownKeys(before.receivedFrames, after.receivedFrames).length;
};

/** Number of local video layers encoded during a one-second window: 0 once no viewer wants any of them. */
export const countEncodedVideoLayers = async (page: Page): Promise<number> => {
	const [before, after] = await snapshotsOneSecondApart(page);
	return grownKeys(before.encodedFrames, after.encodedFrames).length;
};

export type RemoteAudioReport = { tracks: number; interruptions: string[] };

type AudioRecorderWindow = typeof window & { __stopAudioRecording: () => RemoteAudioReport };

/**
 * Checks every remote `<audio>` once per second until `stop`: the same element has to keep playing a live
 * track that received packets and concealed less than a quarter of that second. `stop` resolves with
 * how many audio tracks were seen and every failed check as `<participant>:<source> <reason> at <n>s`.
 */
export const recordRemoteAudio = async (page: Page): Promise<{ stop: () => Promise<RemoteAudioReport> }> => {
	await page.evaluate(() => {
		type AudioStats = { packetsReceived: number; totalSamplesReceived: number; concealedSamples: number };
		type Reading = { element: HTMLAudioElement; packets: number; samples: number; concealed: number };
		const maxConcealedShare = 0.25;
		const readings = new Map<string, Reading>();
		const seen = new Set<string>();
		const interruptions: string[] = [];
		const startedAt = performance.now();
		let timer: number | undefined;
		let stopped = false;

		const interruption = (previous: Reading, current: Reading, track?: MediaStreamTrack): string | undefined => {
			if (previous.element !== current.element) return 'replaced';

			if (current.element.paused || current.element.muted || track?.readyState !== 'live' || !track.enabled) {
				return 'not playing';
			}

			if (current.packets <= previous.packets) return 'no packets';

			if (current.concealed - previous.concealed > (current.samples - previous.samples) * maxConcealedShare) {
				return 'concealed';
			}

			return undefined;
		};

		const check = async () => {
			const audioStats = new Map<string, AudioStats>();
			const connections = (window as PeerConnectionWindow).__peerConnections ?? [];

			for (const connection of connections.filter((c) => c.connectionState !== 'closed')) {
				(await connection.getStats()).forEach((report) => {
					if (report.type === 'inbound-rtp' && report.kind === 'audio') {
						audioStats.set(report.trackIdentifier, report);
					}
				});
			}

			if (stopped) return;

			const second = Math.round((performance.now() - startedAt) / 1_000);
			const present = new Set<string>();

			for (const element of Array.from(document.querySelectorAll<HTMLAudioElement>('audio[data-participant]'))) {
				const key = `${element.dataset['participant']}:${element.dataset['source']}`;
				const track = (element.srcObject as MediaStream | null)?.getAudioTracks()[0];
				const stats = track && audioStats.get(track.id);
				const current = {
					element,
					packets: stats?.packetsReceived ?? 0,
					samples: stats?.totalSamplesReceived ?? 0,
					concealed: stats?.concealedSamples ?? 0
				};
				const previous = readings.get(key);
				const reason = previous && interruption(previous, current, track);

				if (reason) interruptions.push(`${key} ${reason} at ${second}s`);

				readings.set(key, current);
				present.add(key);
				seen.add(key);
			}

			for (const key of readings.keys()) {
				if (present.has(key)) continue;

				interruptions.push(`${key} removed at ${second}s`);
				readings.delete(key);
			}

			timer = window.setTimeout(check, 1_000);
		};

		(window as AudioRecorderWindow).__stopAudioRecording = () => {
			stopped = true;
			window.clearTimeout(timer);
			return { tracks: seen.size, interruptions };
		};

		void check();
	});

	return { stop: () => page.evaluate(() => (window as AudioRecorderWindow).__stopAudioRecording()) };
};

/** Playwright cannot hide a tab, so the document reports the given state and fires `visibilitychange`. */
export const setTabVisibility = async (page: Page, state: DocumentVisibilityState): Promise<void> => {
	await page.evaluate((visibility) => {
		Object.defineProperty(document, 'visibilityState', { get: () => visibility, configurable: true });
		Object.defineProperty(document, 'hidden', { get: () => visibility === 'hidden', configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));
	}, state);
};
