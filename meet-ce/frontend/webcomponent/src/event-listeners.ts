type Callback = (payload: never) => void;

/**
 * The callbacks a host registers on `<openvidu-meet>` through `on()`, `once()` and `off()`. Like
 * `addEventListener`, a callback is registered at most once per event, however it was added.
 */
export class EventListeners {
	private readonly listeners = new Map<string, Map<Callback, EventListener>>();

	constructor(private readonly target: EventTarget) {}

	get size(): number {
		return this.listeners.size;
	}

	add(eventName: string, callback: Callback, once = false): void {
		const listeners = this.listeners.get(eventName) ?? new Map<Callback, EventListener>();

		if (listeners.has(callback)) return;

		const listener: EventListener = (event) => {
			if (once) this.remove(eventName, callback);

			callback((event as CustomEvent).detail as never);
		};

		listeners.set(callback, listener);
		this.listeners.set(eventName, listeners);
		this.target.addEventListener(eventName, listener);
	}

	remove(eventName: string, callback?: Callback): void {
		const listeners = this.listeners.get(eventName);

		if (!listeners) return;

		for (const [registered, listener] of listeners) {
			if (callback && registered !== callback) continue;

			this.target.removeEventListener(eventName, listener);
			listeners.delete(registered);
		}

		if (listeners.size === 0) this.listeners.delete(eventName);
	}

	clear(): void {
		for (const eventName of [...this.listeners.keys()]) {
			this.remove(eventName);
		}
	}
}
