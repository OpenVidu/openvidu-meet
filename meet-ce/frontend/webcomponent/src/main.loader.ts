import { EmbeddedAttribute, EmbeddedCommandName, EmbeddedEventName } from '@openvidu-meet/typings';
import { computeServerUrl } from 'projects/shared-meet-components/src/lib/shared/utils/url.utils';

/**
 * Lazy loader for `<openvidu-meet>`: the tiny bundle served at the stable url `<basePath>/v1/openvidu-meet.js`.
 *
 * It registers `<openvidu-meet>` without loading Angular and `import()`s the heavy ESM the first time an
 * element connects. The ESM registers the real Angular Elements element as `openvidu-meet-impl` (through
 * {@link bootstrapOpenViduMeet}, its own auto-define suppressed by `__OV_MEET_SKIP_AUTODEFINE__`) and the
 * loader delegates to an inner `<openvidu-meet-impl>`: attributes and properties are forwarded, imperative
 * calls are buffered until it exists, and its events are re-dispatched on the loader.
 *
 * The delegated surface comes from `@openvidu-meet/typings`.
 */

declare global {
	// `declare global` only augments globalThis through `var` bindings.
	var __OV_MEET_SKIP_AUTODEFINE__: boolean | undefined;
}

const LOADER_TAG = 'openvidu-meet';
const IMPL_TAG = 'openvidu-meet-impl';

// A DOM move fires disconnectedCallback and connectedCallback synchronously, so the reconnect cancels the
// teardown within this window and the live meeting survives. Only a genuine removal lets it fire.
const TEARDOWN_GRACE_MS = 10;

const toCamel = (kebab: string): string => kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

// The deprecated 3.8.0 spellings of commands and events stay proxied here until they leave the typings
// in 3.12.0; nothing needs to change on this side then.
const ATTRIBUTES: readonly string[] = Object.values(EmbeddedAttribute);
const PROPERTIES: readonly string[] = ATTRIBUTES.map(toCamel);
const METHODS: readonly string[] = Object.values(EmbeddedCommandName);
const EVENTS: readonly string[] = Object.values(EmbeddedEventName);

const ESM_FILENAME = 'openvidu-meet.esm.js';
const ESM_PATH = `v1/${ESM_FILENAME}`;

// `document.currentScript` is only set while this script runs, so its url is captured now.
const loaderSrc = (document.currentScript as HTMLScriptElement | null)?.src;
const SIBLING_ESM_URL = new URL(ESM_FILENAME, loaderSrc || window.location.href).href;

type ImplModule = { bootstrapOpenViduMeet: (tag: string) => Promise<void> };

// The bundle sits next to this script unless the host serves the loader from somewhere else (a proxy that
// forwards only `/openvidu-meet.js`, a copy in its own assets); then the Meet server the element points at
// has it. That url is resolved only once the sibling has failed: a host that binds `room-url` through a
// framework sets it right after the element connects.
const importEsm = async (meetServerEsmUrl: () => string | null): Promise<ImplModule> => {
	try {
		return (await import(SIBLING_ESM_URL)) as ImplModule;
	} catch (error) {
		const fallbackUrl = meetServerEsmUrl();

		if (!fallbackUrl || fallbackUrl === SIBLING_ESM_URL) throw error;

		console.warn(
			`[OpenVidu Meet] ${SIBLING_ESM_URL} is not reachable, loading the bundle from ` +
				`${fallbackUrl} instead. Serve both webcomponent urls from the same place to ` +
				'save this extra request.'
		);

		return (await import(fallbackUrl)) as ImplModule;
	}
};

const importImpl = async (meetServerEsmUrl: () => string | null): Promise<void> => {
	if (customElements.get(IMPL_TAG)) return;

	globalThis.__OV_MEET_SKIP_AUTODEFINE__ = true;
	const mod = await importEsm(meetServerEsmUrl);
	await mod.bootstrapOpenViduMeet(IMPL_TAG);
};

// Loaded once per page. A failed load is forgotten so a retry or a later reconnect imports again.
let implReady: Promise<void> | null = null;

const loadImpl = (meetServerEsmUrl: () => string | null): Promise<void> => {
	implReady ??= importImpl(meetServerEsmUrl).catch((err) => {
		implReady = null;
		throw err;
	});

	return implReady;
};

const LOADER_STYLES = `
	:host { display: block; width: 100%; height: 100%; }
	${IMPL_TAG} { display: block; width: 100%; height: 100%; }
	.ov-loader {
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		width: 100%; height: 100%;
	}
	.ov-loader-spinner {
		width: 42px; height: 42px; border-radius: 50%;
		border: 4px solid rgba(127, 127, 127, 0.25); border-top-color: rgba(127, 127, 127, 0.85);
		animation: ov-loader-spin 0.9s linear infinite;
	}
	@keyframes ov-loader-spin { to { transform: rotate(360deg); } }
	.ov-loader-error {
		margin: 0 0 12px; max-width: 32ch; text-align: center;
		font: 500 14px/1.4 system-ui, sans-serif; color: rgba(127, 127, 127, 0.95);
	}
	.ov-loader-retry {
		font: 500 13px/1 system-ui, sans-serif; padding: 8px 16px; border-radius: 6px;
		border: 1px solid rgba(127, 127, 127, 0.5); background: transparent; color: inherit; cursor: pointer;
	}
	.ov-loader-retry:hover { background: rgba(127, 127, 127, 0.12); }
`;

// Shared by every instance through `adoptedStyleSheets`; engines without constructable stylesheets get a
// <style> element per shadow root instead.
let sharedStyleSheet: CSSStyleSheet | null = null;

try {
	sharedStyleSheet = new CSSStyleSheet();
	sharedStyleSheet.replaceSync(LOADER_STYLES);
} catch {
	sharedStyleSheet = null;
}

type ImplElement = HTMLElement & Record<string, unknown>;
type ImplWrite = (impl: ImplElement) => void;
type DeferredCall = { method: string; args: unknown[] };

class OpenViduMeetLoader extends HTMLElement {
	static readonly observedAttributes = ATTRIBUTES;

	// Not `private` so the accessors and methods defined on the prototype below can reach them.
	_impl: ImplElement | null = null;
	_props: Record<string, unknown> = {};
	// The host's last write per input, attribute or property: that is all a mounted impl needs, as it
	// feeds both into the same input and the last one wins there too.
	readonly _writes = new Map<string, ImplWrite>();
	_deferred: DeferredCall[] = [];
	readonly _handlerMap = new Map<string, Map<(payload: unknown) => void, EventListener>>();
	_placeholder: HTMLElement | null = null;
	_teardownTimer: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		super();
		const shadow = this.attachShadow({ mode: 'open' });

		if (sharedStyleSheet) {
			shadow.adoptedStyleSheets = [sharedStyleSheet];
		} else {
			const style = document.createElement('style');
			style.textContent = LOADER_STYLES;
			shadow.appendChild(style);
		}

		this._showLoading();
	}

	attributeChangedCallback(name: string): void {
		const value = this.getAttribute(name);

		this._write(toCamel(name), (impl) => {
			if (value === null) impl.removeAttribute(name);
			else impl.setAttribute(name, value);
		});
	}

	connectedCallback(): void {
		if (this._teardownTimer !== null) {
			clearTimeout(this._teardownTimer);
			this._teardownTimer = null;
		}

		if (!this._impl) void this._load();
	}

	disconnectedCallback(): void {
		if (this._teardownTimer !== null) return;

		this._teardownTimer = setTimeout(() => {
			this._teardownTimer = null;
			this._impl?.remove();
			this._impl = null;
		}, TEARDOWN_GRACE_MS);
	}

	_write(input: string, write: ImplWrite): void {
		this._writes.delete(input);
		this._writes.set(input, write);

		if (this._impl) write(this._impl);
	}

	async _load(): Promise<void> {
		try {
			await loadImpl(() => this._meetServerEsmUrl());
			this._upgrade();
		} catch (err) {
			console.error('[OpenVidu Meet] failed to load the web component bundle', err);
			this._showError();
		}
	}

	_meetServerEsmUrl(): string | null {
		const roomUrl = (this._props['roomUrl'] as string) || this.getAttribute(EmbeddedAttribute.ROOM_URL);
		const recordingUrl =
			(this._props['recordingUrl'] as string) || this.getAttribute(EmbeddedAttribute.RECORDING_URL);
		const serverUrl = roomUrl
			? computeServerUrl(roomUrl, '/room/')
			: computeServerUrl(recordingUrl ?? '', '/recording/');

		return serverUrl ? `${serverUrl}/${ESM_PATH}` : null;
	}

	_showLoading(): void {
		const placeholder = document.createElement('div');
		placeholder.className = 'ov-loader';
		placeholder.setAttribute('part', 'loading');
		placeholder.appendChild(document.createElement('div')).className = 'ov-loader-spinner';
		this.shadowRoot!.appendChild(placeholder);
		this._placeholder = placeholder;
	}

	_showError(): void {
		this._placeholder?.remove();

		const box = document.createElement('div');
		box.className = 'ov-loader';
		box.setAttribute('part', 'error');

		const message = document.createElement('p');
		message.className = 'ov-loader-error';
		message.textContent = 'Could not load OpenVidu Meet.';

		const retry = document.createElement('button');
		retry.type = 'button';
		retry.className = 'ov-loader-retry';
		retry.textContent = 'Retry';
		retry.addEventListener('click', () => {
			box.remove();
			this._showLoading();
			void this._load();
		});

		box.appendChild(message);
		box.appendChild(retry);
		this.shadowRoot!.appendChild(box);
		this._placeholder = box;
	}

	on(eventName: EmbeddedEventName, callback: (payload: unknown) => void): this {
		const listener: EventListener = (e: Event) => callback((e as CustomEvent).detail);

		if (!this._handlerMap.has(eventName)) {
			this._handlerMap.set(eventName, new Map());
		}

		this._handlerMap.get(eventName)!.set(callback, listener);
		this.addEventListener(eventName, listener);
		return this;
	}

	once(eventName: EmbeddedEventName, callback: (payload: unknown) => void): this {
		const wrapper = (payload: unknown): void => {
			this.off(eventName, wrapper);
			callback(payload);
		};

		return this.on(eventName, wrapper);
	}

	off(eventName: EmbeddedEventName, callback?: (payload: unknown) => void): this {
		const handlers = this._handlerMap.get(eventName);

		if (!handlers) return this;

		if (!callback) {
			handlers.forEach((listener) => this.removeEventListener(eventName, listener));
			this._handlerMap.delete(eventName);
		} else {
			const listener = handlers.get(callback);

			if (listener) {
				this.removeEventListener(eventName, listener);
				handlers.delete(callback);

				if (handlers.size === 0) this._handlerMap.delete(eventName);
			}
		}

		return this;
	}

	_upgrade(): void {
		if (this._impl || !this.isConnected) return;

		const impl = document.createElement(IMPL_TAG) as ImplElement;

		// A composed event already reaches the loader's listeners on its own, as the shadow host is in
		// its path; re-dispatching it would deliver it twice.
		for (const name of EVENTS) {
			impl.addEventListener(name, (e: Event) => {
				const ce = e as CustomEvent;

				if (ce.composed) return;

				this.dispatchEvent(new CustomEvent(name, { detail: ce.detail, bubbles: ce.bubbles }));
			});
		}

		for (const write of this._writes.values()) write(impl);

		this.shadowRoot!.appendChild(impl);
		this._placeholder?.remove();
		this._placeholder = null;
		this._impl = impl;

		for (const { method, args } of this._deferred) {
			(impl[method] as ((...a: unknown[]) => unknown) | undefined)?.(...args);
		}

		this._deferred = [];
	}
}

for (const prop of PROPERTIES) {
	Object.defineProperty(OpenViduMeetLoader.prototype, prop, {
		configurable: true,
		enumerable: true,
		get(this: OpenViduMeetLoader): unknown {
			return this._impl ? this._impl[prop] : this._props[prop];
		},
		set(this: OpenViduMeetLoader, value: unknown) {
			this._props[prop] = value;
			this._write(prop, (impl) => {
				impl[prop] = value;
			});
		}
	});
}

// Buffered calls keep the name they were made with: resolving a deprecated alias is the impl's job.
for (const method of METHODS) {
	Object.defineProperty(OpenViduMeetLoader.prototype, method, {
		configurable: true,
		enumerable: false,
		value(this: OpenViduMeetLoader, ...args: unknown[]): unknown {
			if (this._impl) {
				return (this._impl[method] as (...a: unknown[]) => unknown)(...args);
			}

			this._deferred.push({ method, args });
			return undefined;
		}
	});
}

if (!customElements.get(LOADER_TAG)) {
	customElements.define(LOADER_TAG, OpenViduMeetLoader);
}
