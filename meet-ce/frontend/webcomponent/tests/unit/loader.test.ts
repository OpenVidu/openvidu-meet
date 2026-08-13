import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EmbeddedCommandName, EmbeddedEventName } from '@openvidu-meet/typings';

// The loader `import()`s the heavy ESM only when the internal `openvidu-meet-impl`
// tag is NOT yet defined. By registering a lightweight stand-in for that tag BEFORE
// any element connects, `importImpl()` short-circuits (see the `customElements.get`
// guard in main.loader.ts) and the whole delegation surface can be exercised in
// jsdom without pulling in Angular / LiveKit / the 5.6 MB bundle.
// Mirrors the real impl (the custom-element wrapper): canonical methods plus the deprecated
// spellings, which the loader must keep proxying for the whole deprecation window.
class FakeImpl extends HTMLElement {
	meetingEnd = jest.fn();
	meetingLeave = jest.fn();
	participantKick = jest.fn();
	mediaToggleAudio = jest.fn();
	mediaToggleVideo = jest.fn();
	mediaToggleScreenShare = jest.fn();
	endMeeting = jest.fn();
	leaveRoom = jest.fn();
	kickParticipant = jest.fn();
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
};

// Flush microtasks (connectedCallback awaits loadImpl) + one macrotask
// (MutationObserver / setTimeout-based work).
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// Wait past the loader's deferred-teardown grace window (TEARDOWN_GRACE_MS = 10 ms)
// so a genuine removal has actually torn the impl down.
const flushGrace = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

const createLoader = (): Loader => document.createElement('openvidu-meet') as Loader;

const implOf = (el: Loader): FakeImpl => el.shadowRoot!.querySelector('openvidu-meet-impl') as FakeImpl;

describe('openvidu-meet lazy loader', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('registers <openvidu-meet> immediately (no Angular needed)', () => {
		expect(customElements.get('openvidu-meet')).toBeDefined();
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
			const other = document.createElement('div');
			document.body.appendChild(other);
			other.appendChild(el);
			await flush();

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
		});
	});
});
