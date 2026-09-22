/**
 * @jest-environment-options {"url": "http://localhost/v1/openvidu-meet.js"}
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * The other loader suite predefines `openvidu-meet-impl`, so `importImpl()` short-circuits and the
 * bundle is never imported. Here the tag is deliberately left undefined: jsdom cannot fetch the
 * sibling ESM, so every load fails and this is the only place the fallback decision, the error box
 * and Retry actually run.
 *
 * The page url makes the loader's own sibling url `http://localhost/v1/openvidu-meet.esm.js`, which
 * is exactly what a Meet server serves it as: an element pointing at that same server must not be
 * asked to re-import the url that has just failed.
 */
const SIBLING_ESM_URL = 'http://localhost/v1/openvidu-meet.esm.js';

let warn: jest.SpiedFunction<typeof console.warn>;
let error: jest.SpiedFunction<typeof console.error>;

beforeAll(async () => {
	await import('../../src/main.loader');
});

type Loader = HTMLElement & { roomUrl?: string };

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// The load is two awaits deep (loadImpl, then the rejected import), so the error UI is one extra
// turn away from the connect that started it.
const settleLoad = async (): Promise<void> => {
	await flush();
	await flush();
};

const connect = async (roomUrl?: string): Promise<Loader> => {
	const el = document.createElement('openvidu-meet') as Loader;

	if (roomUrl) el.roomUrl = roomUrl;

	document.body.appendChild(el);
	await settleLoad();
	return el;
};

const errorBox = (el: Loader): HTMLElement => el.shadowRoot!.querySelector('[part="error"]') as HTMLElement;

describe('openvidu-meet lazy loader, when the bundle cannot be loaded', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		error = jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('replaces the placeholder with an error box offering a retry, and says so in the console', async () => {
		const el = await connect();
		const box = errorBox(el);

		expect(el.shadowRoot!.querySelector('[part="loading"]')).toBeNull();
		expect(box.className).toBe('ov-loader');
		expect(box.querySelector('p.ov-loader-error')!.textContent).toBe('Could not load OpenVidu Meet.');

		const retry = box.querySelector('button.ov-loader-retry') as HTMLButtonElement;
		expect(retry.type).toBe('button');
		expect(retry.textContent).toBe('Retry');

		// The rejection comes from the module loader, so it is not this realm's Error.
		expect(error).toHaveBeenCalledWith(
			'[OpenVidu Meet] failed to load the web component bundle',
			expect.anything()
		);
	});

	it('puts the loading placeholder back and loads again when Retry is clicked', async () => {
		const el = await connect();
		(errorBox(el).querySelector('button.ov-loader-retry') as HTMLButtonElement).click();

		const placeholder = el.shadowRoot!.querySelector('[part="loading"]')!;
		expect(placeholder.querySelector('.ov-loader-spinner')).not.toBeNull();
		expect(errorBox(el)).toBeNull();

		// The load it started fails the same way, so the error box comes back.
		await settleLoad();
		expect(errorBox(el)).not.toBeNull();
		expect(error).toHaveBeenCalledTimes(2);
	});

	it('falls back to the bundle on the Meet server the element points at', async () => {
		await connect('https://meet.example.com/room/room-1');

		expect(warn).toHaveBeenCalledWith(
			`[OpenVidu Meet] ${SIBLING_ESM_URL} is not reachable, loading the bundle from ` +
				'https://meet.example.com/v1/openvidu-meet.esm.js instead. Serve both webcomponent urls ' +
				'from the same place to save this extra request.'
		);
	});

	it('does not re-import the url that just failed when the Meet server serves this very loader', async () => {
		await connect('http://localhost/room/room-1');

		expect(warn).not.toHaveBeenCalled();
	});

	it('has nothing to fall back to when the host set no url, and says nothing about one', async () => {
		await connect();

		expect(warn).not.toHaveBeenCalled();
	});

	it('imports again for the next element instead of reusing the failed load', async () => {
		await connect('https://meet.example.com/room/room-1');
		await connect('https://meet.example.com/room/room-2');

		expect(warn).toHaveBeenCalledTimes(2);
	});
});
