import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { STORAGE_PREFIX } from '../models/storage.model';
import { BrowserStorageService } from './browser-storage.service';
import { LoggerService } from './logger.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

/**
 * The one place in the library allowed to touch Web Storage, and therefore the one place that
 * decides three things everything else depends on: the prefix that keeps Meet's keys apart from the
 * host page's, the `{ item }` wrapper that lets `false`, `0` and `''` come back as themselves
 * instead of as "absent", and the no-op mode for the browsers where storage throws.
 */
describe('BrowserStorageService', () => {
	let service: BrowserStorageService;

	const createService = (): BrowserStorageService => {
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				BrowserStorageService,
				{ provide: LoggerService, useClass: LoggerServiceStub }
			]
		});

		return TestBed.inject(BrowserStorageService);
	};

	beforeEach(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
		service = createService();
	});

	afterEach(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
	});

	it('writes under the Meet prefix, wrapped so the value keeps its type', () => {
		service.set('participantName', 'Ana');

		expect(window.localStorage.getItem(`${STORAGE_PREFIX}participantName`)).toBe('{"item":"Ana"}');
		expect(service.get('participantName')).toBe('Ana');
	});

	// Read as "absent", any of these would silently turn into the store's default: a muted
	// microphone would come back on, a docked tile would float again.
	it('round-trips the values that read as absent anywhere else', () => {
		const falsy = [false, 0, '', null];

		for (const [index, value] of falsy.entries()) {
			service.set(`falsy-${index}`, value);
		}

		expect(falsy.map((_, index) => service.get(`falsy-${index}`))).toEqual(falsy);
	});

	it('answers null for a key nobody wrote', () => {
		expect(service.get('never-written')).toBeNull();
	});

	it('keeps local and session storage apart', () => {
		service.set('roomSecret', 'from-local');
		service.set('roomSecret', 'from-session', 'session');

		expect(service.get('roomSecret')).toBe('from-local');
		expect(service.get('roomSecret', 'session')).toBe('from-session');
		expect(window.sessionStorage.getItem(`${STORAGE_PREFIX}roomSecret`)).toBe('{"item":"from-session"}');
	});

	it('removes a key from the area it was told, and only that one', () => {
		service.set('roomSecret', 'from-local');
		service.set('roomSecret', 'from-session', 'session');

		service.remove('roomSecret', 'session');

		expect(service.get('roomSecret')).toBe('from-local');
		expect(service.get('roomSecret', 'session')).toBeNull();
	});

	// A key of the host application, or one from an older format, landing on the same name.
	it('discards an entry that is not one of its own instead of reading it', () => {
		window.localStorage.setItem(`${STORAGE_PREFIX}foreign`, '"a plain string"');
		window.localStorage.setItem(`${STORAGE_PREFIX}garbage`, 'not json at all');

		expect(service.get('foreign')).toBeNull();
		expect(service.get('garbage')).toBeNull();
		expect(window.localStorage.getItem(`${STORAGE_PREFIX}foreign`)).toBeNull();
		expect(window.localStorage.getItem(`${STORAGE_PREFIX}garbage`)).toBeNull();
	});

	// Safari's private mode and storage-blocking policies throw on access rather than returning
	// null, which would take the whole app down on the first read.
	describe('where the browser refuses storage', () => {
		let descriptor: PropertyDescriptor | undefined;

		beforeEach(() => {
			descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
			Object.defineProperty(window, 'localStorage', {
				configurable: true,
				get: () => {
					throw new DOMException('The operation is insecure.', 'SecurityError');
				}
			});
			service = createService();
		});

		afterEach(() => {
			if (descriptor) {
				Object.defineProperty(window, 'localStorage', descriptor);
			}
		});

		it('turns every operation into a no-op instead of throwing', () => {
			expect(() => service.set('participantName', 'Ana')).not.toThrow();
			expect(service.get('participantName')).toBeNull();
			expect(() => service.remove('participantName')).not.toThrow();
		});
	});
});
