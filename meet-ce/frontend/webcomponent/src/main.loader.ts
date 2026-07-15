import { EmbeddedAttribute, EmbeddedCommandName, EmbeddedEventName } from '@openvidu-meet/typings';

/**
 * Lazy loader for `<openvidu-meet>`.
 *
 * This is the tiny (~KB) bundle served at the STABLE url `<basePath>/v1/openvidu-meet.js`.
 * It registers `<openvidu-meet>` immediately without pulling in Angular/LiveKit, so a host page's
 * `<script src>` costs almost nothing. The heavy ~5.8 MB bundle is `import()`ed only when an
 * `<openvidu-meet>` element actually connects to the DOM — deferring the parse until the meeting is
 * really used, with zero changes required in the host page.
 *
 * Mechanics (see MEET-WC-API-V2-PROPOSAL §5.3):
 *  - The heavy ESM registers the REAL Angular Elements element under the internal tag
 *    `openvidu-meet-impl` (via the exported {@link bootstrapOpenViduMeet}, suppressing its own
 *    auto-define with the `__OV_MEET_SKIP_AUTODEFINE__` flag).
 *  - This loader delegates to an inner `<openvidu-meet-impl>`: properties + attributes are mirrored,
 *    imperative calls made before load are buffered and replayed, and events are re-dispatched onto
 *    the loader so listeners on `<openvidu-meet>` keep working.
 *
 * The delegated surface is derived from `@openvidu-meet/typings` (single source of truth).
 */

declare global {
	// Set before importing the heavy bundle so it skips its own `openvidu-meet`
	// auto-registration; the loader registers `openvidu-meet-impl` instead.
	// eslint-disable-next-line no-var
	var __OV_MEET_SKIP_AUTODEFINE__: boolean | undefined;
}

const LOADER_TAG = 'openvidu-meet';
const IMPL_TAG = 'openvidu-meet-impl';

// Grace period before tearing the inner meeting down after the loader leaves the
// DOM. A DOM *move* (re-parenting) fires disconnectedCallback then connectedCallback
// synchronously within the same DOM operation, so the reconnect cancels this timer
// before it can run and the live meeting is preserved untouched — mirroring Angular
// Elements' own ~10 ms destroy grace. Only a genuine removal (no reconnect) lets it
// fire and tears the meeting down.
const TEARDOWN_GRACE_MS = 10;

/** kebab-case attribute → camelCase JS property (e.g. `room-url` → `roomUrl`). */
const toCamel = (kebab: string): string => kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

// Public delegation surface, from the typings registry.
const ATTRIBUTES: readonly string[] = Object.values(EmbeddedAttribute);
const PROPERTIES: readonly string[] = ATTRIBUTES.map(toCamel);
const METHODS: readonly string[] = Object.values(EmbeddedCommandName); // endMeeting, leaveRoom, kickParticipant
// Only NON-composed embedded events need bridging (see _upgrade). The wrapper's
// `ready` is dispatched `composed`, so it crosses the shadow boundary to
// <openvidu-meet> on its own — listing it here would only add a dead bridge
// listener that the composed-guard always skips.
const EVENTS: readonly string[] = Object.values(EmbeddedEventName);

// Resolve the sibling heavy ESM url from this script's own `src`, captured
// synchronously at load (`document.currentScript` is only valid during initial
// classic-script execution). Served at `.../v1/openvidu-meet.js`, so the sibling
// resolves to `.../v1/openvidu-meet.esm.js`.
const loaderSrc = (document.currentScript as HTMLScriptElement | null)?.src;
const ESM_URL = new URL('openvidu-meet.esm.js', loaderSrc || window.location.href).href;

// Load the heavy bundle once (shared across every loader instance) and register
// the internal implementation tag.
let implReady: Promise<void> | null = null;
const importImpl = async (): Promise<void> => {
	// Already registered (e.g. the ESM was imported directly, or a previous load
	// already ran): nothing to import or bootstrap. Keeps this idempotent.
	if (customElements.get(IMPL_TAG)) return;
	globalThis.__OV_MEET_SKIP_AUTODEFINE__ = true;
	const mod: { bootstrapOpenViduMeet: (tag: string) => Promise<void> } = await import(ESM_URL);
	await mod.bootstrapOpenViduMeet(IMPL_TAG);
};
// Memoized so the heavy bundle loads at most once per page. On failure the cached
// promise is CLEARED so a later reconnect can retry — otherwise a single transient
// import error (network blip, 5xx) would leave a permanently-rejected promise and
// break every <openvidu-meet> on the page for good.
const loadImpl = (): Promise<void> => {
	if (!implReady) {
		implReady = importImpl().catch((err) => {
			implReady = null;
			throw err;
		});
	}

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

// One CSSStyleSheet shared by every loader instance via `adoptedStyleSheets`,
// instead of cloning an identical <style> element into each shadow root. Falls
// back to a per-instance <style> where constructable stylesheets aren't available
// (very old engines / some jsdom versions).
let sharedStyleSheet: CSSStyleSheet | null = null;
try {
	sharedStyleSheet = new CSSStyleSheet();
	sharedStyleSheet.replaceSync(LOADER_STYLES);
} catch {
	sharedStyleSheet = null;
}

type ImplElement = HTMLElement & Record<string, unknown>;
type DeferredCall = { method: string; args: unknown[] };

class OpenViduMeetLoader extends HTMLElement {
	// Not marked `private` so the dynamically-defined property accessors/methods
	// below (outside the class body) can reach them.
	_impl: ImplElement | null = null;
	_props: Record<string, unknown> = {};
	_deferred: DeferredCall[] = [];
	readonly _handlerMap = new Map<string, Map<(payload: unknown) => void, EventListener>>();
	_attrObserver: MutationObserver | null = null;
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

	async connectedCallback(): Promise<void> {
		// A pending teardown means we just left the DOM: this reconnect is the tail
		// of a move (re-parenting), so cancel it and keep the live meeting intact.
		if (this._teardownTimer !== null) {
			clearTimeout(this._teardownTimer);
			this._teardownTimer = null;
		}

		// Impl already mounted (preserved across a move): nothing to load or rebuild.
		if (this._impl) return;

		await this._load();
	}

	disconnectedCallback(): void {
		// Defer teardown so a DOM move (disconnect immediately followed by reconnect)
		// preserves the live meeting; only a genuine removal lets it fire. See
		// TEARDOWN_GRACE_MS.
		if (this._teardownTimer !== null) return;
		this._teardownTimer = setTimeout(() => {
			this._teardownTimer = null;
			this._attrObserver?.disconnect();
			this._attrObserver = null;
			// Drop the inner element so Angular tears the meeting down; a later
			// reconnect rebuilds it via _upgrade().
			this._impl?.remove();
			this._impl = null;
		}, TEARDOWN_GRACE_MS);
	}

	// Load the heavy bundle and hand off to the impl. On failure the spinner is
	// swapped for a retryable error state (rather than spinning forever);
	// `loadImpl()` clears its memoized promise on failure, so the retry (or a later
	// reconnect) re-imports.
	async _load(): Promise<void> {
		try {
			await loadImpl();
			this._upgrade();
		} catch (err) {
			console.error('[OpenVidu Meet] failed to load the web component bundle', err);
			this._showError();
		}
	}

	// ── Placeholder states ───────────────────────────────────────────────────────
	_showLoading(): void {
		const placeholder = document.createElement('div');
		placeholder.className = 'ov-loader';
		placeholder.setAttribute('part', 'loading');
		placeholder.appendChild(document.createElement('div')).className = 'ov-loader-spinner';
		this.shadowRoot!.appendChild(placeholder);
		this._placeholder = placeholder;
	}

	_showError(): void {
		// Swap the spinner for a retryable error state so a failed load (a transient
		// network / 5xx blip, or a hard misconfiguration) doesn't spin forever.
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

	// ── on / once / off (mirrors wrapper.ts, listeners live on the loader) ──────
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

	// ── Handoff ─────────────────────────────────────────────────────────────────
	_upgrade(): void {
		if (this._impl || !this.isConnected) return;

		const impl = document.createElement(IMPL_TAG) as ImplElement;

		// 1. Bridge the impl's events onto the loader (before connecting it) so
		//    listeners on <openvidu-meet> fire. Only NON-composed events need this:
		//    a `composed` event (e.g. the wrapper's `ready`) is dispatched inside the
		//    loader's shadow root, so the host <openvidu-meet> becomes an AT_TARGET
		//    node in the event path (its shadow-adjusted target retargets to the
		//    host). AT_TARGET invokes bubble-phase listeners too, regardless of
		//    `bubbles`, so the event already reaches listeners on <openvidu-meet> on
		//    its own — re-dispatching it here would deliver it twice.
		for (const name of EVENTS) {
			impl.addEventListener(name, (e: Event) => {
				const ce = e as CustomEvent;
				if (ce.composed) return;
				this.dispatchEvent(new CustomEvent(name, { detail: ce.detail, bubbles: ce.bubbles }));
			});
		}

		// 2. Copy attributes set on the loader before the bundle loaded.
		for (const attr of Array.from(this.attributes)) {
			impl.setAttribute(attr.name, attr.value);
		}

		// 3. Apply properties set on the loader before the bundle loaded.
		for (const [key, value] of Object.entries(this._props)) {
			impl[key] = value;
		}

		// 4. Mount and reveal.
		this.shadowRoot!.appendChild(impl);
		this._placeholder?.remove();
		this._placeholder = null;
		this._impl = impl;

		// 5. Mirror later attribute changes on the loader to the impl.
		this._attrObserver = new MutationObserver((records) => {
			for (const record of records) {
				const name = record.attributeName;
				if (record.type !== 'attributes' || !name) continue;
				const value = this.getAttribute(name);
				if (value === null) impl.removeAttribute(name);
				else impl.setAttribute(name, value);
			}
		});
		this._attrObserver.observe(this, { attributes: true });

		// 6. Replay imperative calls buffered before the bundle loaded.
		for (const { method, args } of this._deferred) {
			(impl[method] as ((...a: unknown[]) => unknown) | undefined)?.(...args);
		}
		this._deferred = [];
	}
}

// Proxy the input properties (roomUrl, participantName, …): store pre-load, then
// forward to the inner element once it exists.
for (const prop of PROPERTIES) {
	Object.defineProperty(OpenViduMeetLoader.prototype, prop, {
		configurable: true,
		enumerable: true,
		get(this: OpenViduMeetLoader): unknown {
			return this._impl ? this._impl[prop] : this._props[prop];
		},
		set(this: OpenViduMeetLoader, value: unknown) {
			this._props[prop] = value;
			if (this._impl) this._impl[prop] = value;
		}
	});
}

// Proxy the imperative methods (endMeeting, leaveRoom, kickParticipant): delegate
// once the inner element exists, otherwise buffer for replay in _upgrade().
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
