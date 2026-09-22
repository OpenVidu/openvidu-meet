import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EmbeddedAttribute, EmbeddedCommandName, EmbeddedEventName } from '@openvidu-meet/typings';

// The loader `import()`s the heavy ESM only when the internal `openvidu-meet-impl`
// tag is NOT yet defined. By registering a lightweight stand-in for that tag BEFORE
// any element connects, `importImpl()` short-circuits (see the `customElements.get`
// guard in main.loader.ts) and the whole delegation surface can be exercised in
// jsdom without pulling in Angular / LiveKit / the 5.6 MB bundle.
// Mirrors the real impl (the custom-element wrapper): canonical methods plus the deprecated
// spellings, which the loader must keep proxying for the whole deprecation window.
// Set by the test that needs an impl bundle older than the loader: one the host calls a command
// the bundle does not have.
let commandMissingFromImpl: string | null = null;

class FakeImpl extends HTMLElement {
	// Like Angular Elements, the attribute and the property feed one input and the last write wins.
	static readonly observedAttributes = ['show-only-recordings'];
	showOnlyRecordings: unknown = false;

	meetingEnd = jest.fn();
	meetingLeave = jest.fn();
	participantKick = jest.fn();
	participantMute = jest.fn();
	participantMuteAll = jest.fn();
	mediaToggleAudio = jest.fn();
	mediaToggleVideo = jest.fn();
	mediaToggleScreenShare = jest.fn();
	endMeeting = jest.fn();
	leaveRoom = jest.fn();
	kickParticipant = jest.fn();

	constructor() {
		super();

		if (commandMissingFromImpl) delete (this as unknown as Record<string, unknown>)[commandMissingFromImpl];
	}

	attributeChangedCallback(_name: string, _previous: string | null, value: string | null): void {
		this.showOnlyRecordings = value !== null && value !== 'false';
	}
}
customElements.define('openvidu-meet-impl', FakeImpl);

// Importing the loader module registers `<openvidu-meet>` and wires the property /
// method proxies onto its prototype (side effect at module load).
beforeAll(async () => {
	await import('../../src/main.loader');
});

type Loader = HTMLElement & {
	on(name: string, cb: (detail: unknown) => void): Loader;
	once(name: string, cb: (detail: unknown) => void): Loader;
	off(name: string, cb?: (detail: unknown) => void): Loader;
	meetingEnd(): void;
	meetingLeave(): void;
	participantKick(id: string): void;
	endMeeting(): void;
	leaveRoom(): void;
	kickParticipant(id: string): void;
	roomUrl?: string;
	recordingUrl?: string;
	showOnlyRecordings?: boolean;
	_handlerMap: Map<string, Map<unknown, EventListener>>;
	_meetServerEsmUrl(): string | null;
};

// Flush microtasks (connectedCallback awaits loadImpl) + one macrotask
// (setTimeout-based work).
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// Wait past the loader's deferred-teardown grace window (TEARDOWN_GRACE_MS = 10 ms)
// so a genuine removal has actually torn the impl down.
const flushGrace = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

const createLoader = (): Loader => document.createElement('openvidu-meet') as Loader;

const implOf = (el: Loader): FakeImpl => el.shadowRoot!.querySelector('openvidu-meet-impl') as FakeImpl;

describe('openvidu-meet lazy loader', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		commandMissingFromImpl = null;
	});

	it('registers <openvidu-meet> immediately (no Angular needed)', () => {
		expect(customElements.get('openvidu-meet')).toBeDefined();
	});

	// jsdom has no constructable stylesheets, so what runs here is the <style> fallback the loader
	// keeps for engines without them.
	it('styles its shadow root, so the placeholder and the impl fill the host box', () => {
		expect(createLoader().shadowRoot!.querySelector('style')!.textContent).toContain('ov-loader-spinner');
	});

	it('shows a loading placeholder before the impl mounts, then swaps it for the impl', async () => {
		const el = createLoader();
		expect(el.shadowRoot!.querySelector('.ov-loader')).not.toBeNull();

		document.body.appendChild(el);
		await flush();

		expect(el.shadowRoot!.querySelector('.ov-loader')).toBeNull();
		expect(implOf(el)).toBeInstanceOf(FakeImpl);
	});

	describe('event forwarding', () => {
		// The wrapper dispatches `ready` as `composed: true, bubbles: false` inside the
		// loader's shadow root. Because it is `composed`, the host <openvidu-meet>
		// becomes an AT_TARGET node in the event path, so its listeners fire NATIVELY
		// (AT_TARGET invokes bubble-phase listeners regardless of `bubbles`). The
		// loader deliberately does NOT re-dispatch composed events — this test guards
		// against a regression that would deliver `ready` twice.
		it('delivers the composed "ready" event to listeners on <openvidu-meet> exactly once', async () => {
			const el = createLoader();
			const onReady = jest.fn();
			el.addEventListener('ready', onReady);

			document.body.appendChild(el);
			await flush();

			implOf(el).dispatchEvent(new CustomEvent('ready', { composed: true, bubbles: false, detail: { ok: 1 } }));

			expect(onReady).toHaveBeenCalledTimes(1);
			expect((onReady.mock.calls[0][0] as CustomEvent).detail).toEqual({ ok: 1 });
		});

		// Same reason as `ready` above, for an event the loader does listen for: it must not add a
		// second delivery of an event that already reaches the host on its own.
		it('delivers a composed embedded event once', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();

			const cb = jest.fn();
			el.on('joined', cb);

			implOf(el).dispatchEvent(new CustomEvent('joined', { composed: true, bubbles: false, detail: {} }));

			expect(cb).toHaveBeenCalledTimes(1);
		});

		it('forwards non-composed embedded events through the .on() API', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();

			const onJoined = jest.fn();
			el.on('joined', onJoined);

			implOf(el).dispatchEvent(new CustomEvent('joined', { bubbles: false, detail: { name: 'Ada' } }));

			expect(onJoined).toHaveBeenCalledTimes(1);
			expect(onJoined.mock.calls[0][0]).toEqual({ name: 'Ada' });
		});

		it('forwards every event name declared in the typings, canonical and deprecated', async () => {
			// EVENTS is built from Object.values(EmbeddedEventName), same as the command surface —
			// this is what makes "add an event in the typings and the loader picks it up" true, and
			// what keeps the deprecated aliases bridged until they leave the enum in 3.12.0.
			const el = createLoader();
			document.body.appendChild(el);
			await flush();

			const events = Object.values(EmbeddedEventName);
			expect(events.length).toBeGreaterThan(0);

			for (const name of events) {
				const handler = jest.fn();
				el.on(name, handler);

				implOf(el).dispatchEvent(new CustomEvent(name, { bubbles: false, detail: { name: 'Ada' } }));

				expect(handler).toHaveBeenCalledTimes(1);
			}
		});

		it('stops delivering after off()', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();

			const cb = jest.fn();
			el.on('joined', cb);
			el.off('joined', cb);

			implOf(el).dispatchEvent(new CustomEvent('joined', { bubbles: false, detail: {} }));

			expect(cb).not.toHaveBeenCalled();
		});

		it('removes one callback at a time, leaving the others subscribed', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();

			const first = jest.fn();
			const second = jest.fn();
			el.on('joined', first);
			el.on('joined', second);

			el.off('joined', first);
			implOf(el).dispatchEvent(new CustomEvent('joined', { bubbles: false, detail: {} }));

			expect(first).not.toHaveBeenCalled();
			expect(second).toHaveBeenCalledTimes(1);

			el.off('joined', second);
			implOf(el).dispatchEvent(new CustomEvent('joined', { bubbles: false, detail: {} }));

			expect(second).toHaveBeenCalledTimes(1);
		});

		it('delivers a once() subscription exactly one event and then drops it', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();

			const cb = jest.fn();
			el.once('joined', cb);

			implOf(el).dispatchEvent(new CustomEvent('joined', { bubbles: false, detail: { n: 1 } }));
			implOf(el).dispatchEvent(new CustomEvent('joined', { bubbles: false, detail: { n: 2 } }));

			expect(cb).toHaveBeenCalledTimes(1);
			expect(cb).toHaveBeenCalledWith({ n: 1 });
		});

		it('removes every callback of an event when off() is given none, and only that event', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();

			const first = jest.fn();
			const second = jest.fn();
			const other = jest.fn();
			el.on('joined', first);
			el.on('joined', second);
			el.on('left', other);

			el.off('joined');

			implOf(el).dispatchEvent(new CustomEvent('joined', { bubbles: false, detail: {} }));
			implOf(el).dispatchEvent(new CustomEvent('left', { bubbles: false, detail: {} }));

			expect(first).not.toHaveBeenCalled();
			expect(second).not.toHaveBeenCalled();
			expect(other).toHaveBeenCalledTimes(1);
		});

		it('takes off() for an event nothing subscribed to', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();

			expect(el.off('joined')).toBe(el);
			expect(el.off('joined', jest.fn())).toBe(el);
		});

		// A host that subscribes per meeting would otherwise keep every callback of every past
		// meeting alive for as long as the element is on the page.
		it('keeps no bookkeeping for a callback it has removed', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();

			const cb = jest.fn();
			el.on('joined', cb);
			el.on('left', cb);

			el.off('joined', cb);
			el.off('left');

			expect(el._handlerMap.size).toBe(0);
		});
	});

	describe('command delegation', () => {
		// The loader builds its method surface from `Object.values(EmbeddedCommandName)`, so this
		// is what makes "add a command in the typings and the loader picks it up" true — and what
		// keeps the deprecated aliases proxied until they leave the enum in 3.12.0.
		it('proxies every command name declared in the typings, canonical and deprecated', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();

			const impl = implOf(el) as unknown as Record<string, jest.Mock>;
			const commands = Object.values(EmbeddedCommandName);
			expect(commands.length).toBeGreaterThan(0);

			for (const command of commands) {
				(el as unknown as Record<string, () => void>)[command]();
				expect(impl[command]).toHaveBeenCalledTimes(1);
			}
		});
	});

	describe('pre-load buffering', () => {
		it('replays imperative calls made before the bundle loaded', async () => {
			const el = createLoader();
			el.meetingEnd();
			el.participantKick('user-1');

			document.body.appendChild(el);
			await flush();

			const impl = implOf(el);
			expect(impl.meetingEnd).toHaveBeenCalledTimes(1);
			expect(impl.participantKick).toHaveBeenCalledWith('user-1');
		});

		it('replays a deprecated call made before the bundle loaded, under its own name', async () => {
			const el = createLoader();
			el.leaveRoom();

			document.body.appendChild(el);
			await flush();

			// The loader is a transport: it must not rewrite the name it buffered. Resolving the
			// alias is the wrapper's job, one layer down.
			expect(implOf(el).leaveRoom).toHaveBeenCalledTimes(1);
			expect(implOf(el).meetingLeave).not.toHaveBeenCalled();
		});

		// The loader may be newer than the bundle the server hands it (a host that pins the loader
		// url, a cached bundle): a command the bundle does not have is dropped, not thrown.
		it('drops a buffered call the impl turns out not to implement', async () => {
			commandMissingFromImpl = 'meetingEnd';

			const el = createLoader();
			el.meetingEnd();
			el.meetingLeave();

			document.body.appendChild(el);
			await flush();

			expect(implOf(el).meetingEnd).toBeUndefined();
			expect(implOf(el).meetingLeave).toHaveBeenCalledTimes(1);
		});

		it('applies properties set before the bundle loaded', async () => {
			const el = createLoader();
			el.roomUrl = 'https://example/room';

			document.body.appendChild(el);
			await flush();

			expect((implOf(el) as unknown as { roomUrl?: string }).roomUrl).toBe('https://example/room');
		});

		it('copies attributes set before the bundle loaded', async () => {
			const el = createLoader();
			el.setAttribute('room-url', 'https://example/pre');

			document.body.appendChild(el);
			await flush();

			expect(implOf(el).getAttribute('room-url')).toBe('https://example/pre');
		});

		// Both kinds feed the same impl input, so the one the host wrote last wins whichever kind it is.
		it('lets an attribute written after a property win', async () => {
			const el = createLoader();
			el.showOnlyRecordings = false;

			document.body.appendChild(el);
			el.setAttribute('show-only-recordings', '');

			await flush();

			expect(implOf(el).showOnlyRecordings).toBe(true);
		});

		it('lets a property written after an attribute win', async () => {
			const el = createLoader();
			el.setAttribute('show-only-recordings', '');

			document.body.appendChild(el);
			el.showOnlyRecordings = false;

			await flush();

			expect(implOf(el).showOnlyRecordings).toBe(false);
		});
	});

	describe('live attribute mirroring', () => {
		it('mirrors attribute changes made after the impl mounted', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();

			el.setAttribute('room-url', 'https://example/live');
			await flush();
			expect(implOf(el).getAttribute('room-url')).toBe('https://example/live');

			el.removeAttribute('room-url');
			await flush();
			expect(implOf(el).hasAttribute('room-url')).toBe(false);
		});
	});

	// The loader is the element the host holds: frameworks write its inputs as properties and read
	// them back, and a host that serialises it must not find the command names among its own keys.
	describe('the proxied surface on the element', () => {
		const toCamel = (kebab: string): string => kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

		it('declares the inputs as redefinable enumerable accessors and the commands as hidden methods', () => {
			const descriptors = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(createLoader()));

			for (const attribute of Object.values(EmbeddedAttribute)) {
				expect(descriptors[toCamel(attribute)]).toMatchObject({ configurable: true, enumerable: true });
			}

			for (const command of Object.values(EmbeddedCommandName)) {
				expect(descriptors[command]).toMatchObject({ configurable: true, enumerable: false });
			}
		});

		it('reads a property back from the buffer before the impl mounts, and from the impl after', async () => {
			const el = createLoader();
			el.roomUrl = 'https://example/before';

			expect(el.roomUrl).toBe('https://example/before');

			document.body.appendChild(el);
			await flush();
			(implOf(el) as unknown as { roomUrl?: string }).roomUrl = 'https://example/after';

			expect(el.roomUrl).toBe('https://example/after');
		});
	});

	describe('disconnect / reconnect', () => {
		it('preserves the live impl across a DOM move (re-parenting) so the meeting survives', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();
			const first = implOf(el);
			expect(first).toBeInstanceOf(FakeImpl);

			// Move to a different parent: the custom-element disconnect + reconnect
			// reactions fire synchronously within appendChild, so the deferred
			// teardown is cancelled before it can run and the same impl is kept.
			// Asserting past the grace window is what tells a cancelled teardown from a
			// pending one: without the cancel the impl is still there a tick later.
			const other = document.createElement('div');
			document.body.appendChild(other);
			other.appendChild(el);
			await flushGrace();

			expect(implOf(el)).toBe(first);
		});

		it('tears the impl down and rebuilds a fresh one after a genuine removal', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			await flush();
			const first = implOf(el);
			expect(first).toBeInstanceOf(FakeImpl);

			// A real removal (no reconnect): the impl outlives the synchronous
			// disconnect and is still mounted during the grace window...
			el.remove();
			expect(el.shadowRoot!.querySelector('openvidu-meet-impl')).toBe(first);

			// ...then the deferred teardown fires and drops it.
			await flushGrace();
			expect(el.shadowRoot!.querySelector('openvidu-meet-impl')).toBeNull();

			// Re-adding after teardown rebuilds a fresh impl.
			document.body.appendChild(el);
			await flush();
			const second = implOf(el);
			expect(second).toBeInstanceOf(FakeImpl);
			expect(second).not.toBe(first);

			// The element is bound to the rebuilt impl: commands reach it instead of queueing.
			el.meetingEnd();
			expect(second.meetingEnd).toHaveBeenCalledTimes(1);
		});

		// A host framework that mounts, unmounts and remounts in the same turn (or a moved element
		// whose bundle is still loading) runs both callbacks before the first load resolves.
		it('mounts a single impl when it is reconnected while the bundle is still loading', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			el.remove();
			document.body.appendChild(el);
			await flushGrace();

			expect(el.shadowRoot!.querySelectorAll('openvidu-meet-impl')).toHaveLength(1);
		});

		it('mounts nothing into an element removed while the bundle was loading', async () => {
			const el = createLoader();
			document.body.appendChild(el);
			el.remove();
			await flushGrace();

			expect(el.shadowRoot!.querySelector('openvidu-meet-impl')).toBeNull();
		});
	});

	// The bundle normally sits next to the loader script. A host that serves the loader from its
	// own origin (a reverse proxy forwarding only `/openvidu-meet.js`, a copy in its assets) has no
	// sibling there, and the loader falls back to the Meet server the element already points at.
	describe('bundle url on the Meet server the element points at', () => {
		it('derives it from the room url set as a property', () => {
			const el = createLoader();
			el.roomUrl = 'http://meet.example.com/meet/room/my-room?secret=abc';

			expect(el._meetServerEsmUrl()).toBe('http://meet.example.com/meet/v1/openvidu-meet.esm.js');
		});

		it('derives it from the room url set as an attribute', () => {
			const el = createLoader();
			el.setAttribute('room-url', 'https://meet.example.com/room/my-room');

			expect(el._meetServerEsmUrl()).toBe('https://meet.example.com/v1/openvidu-meet.esm.js');
		});

		it('derives it from the recording url when there is no room url', () => {
			const el = createLoader();
			el.recordingUrl = 'http://meet.example.com/meet/recording/rec-1?recordingSecret=abc';

			expect(el._meetServerEsmUrl()).toBe('http://meet.example.com/meet/v1/openvidu-meet.esm.js');
		});

		it('has nothing to fall back to before the host sets either url', () => {
			expect(createLoader()._meetServerEsmUrl()).toBeNull();
		});

		it('has nothing to fall back to when the url the host set cannot be parsed', () => {
			const el = createLoader();
			el.roomUrl = 'not a url';

			expect(el._meetServerEsmUrl()).toBeNull();
		});
	});
});
