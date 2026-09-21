import type { ILogger } from '../../../../shared/models/logger.model';

/** How long a device that answered "still starting" is given to finish being released. */
export const DEVICE_RELEASE_MS = 400;

/**
 * Runs an operation that opens a capture device, asking once more after a pause when the browser
 * answers that the source is still starting: Windows rejects with `AbortError` while the OS has not
 * finished releasing a device its previous consumer just closed, and the very same request succeeds
 * a moment later. Every other failure is the caller's to handle.
 */
export async function acquireDevice<T>(open: () => Promise<T>, log: ILogger): Promise<T> {
	try {
		return await open();
	} catch (error) {
		if ((error as { name?: string })?.name !== 'AbortError') throw error;

		log.w('The device is still starting, asking for it again:', error);
		await new Promise((resolve) => setTimeout(resolve, DEVICE_RELEASE_MS));

		return open();
	}
}

/**
 * Moves a capture onto another device. livekit-client stops the current capture before opening the
 * chosen device, so when that one cannot be opened the capture goes back to the device it was on
 * before the failure is rethrown, instead of being left dead behind a control that says on.
 */
export async function switchDevice(
	switchTo: (deviceId: string) => Promise<unknown>,
	deviceId: string,
	currentDeviceId: string | undefined,
	log: ILogger
): Promise<void> {
	try {
		await acquireDevice(() => switchTo(deviceId), log);
	} catch (error) {
		if (!currentDeviceId) throw error;

		log.w(`Could not switch to device ${deviceId}, going back to ${currentDeviceId}:`, error);
		await acquireDevice(() => switchTo(currentDeviceId), log);

		throw error;
	}
}
