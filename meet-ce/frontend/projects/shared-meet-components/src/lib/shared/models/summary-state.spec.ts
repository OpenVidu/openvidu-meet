import { SummaryState } from './summary-state';

describe('SummaryState', () => {
	const deferred = () => {
		let resolve!: (value: number) => void;
		let reject!: (error: unknown) => void;
		const promise = new Promise<number>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return { promise, resolve, reject };
	};

	it('holds nothing until the first read', () => {
		const state = new SummaryState({ read: () => Promise.resolve(1), onError: () => {} });

		expect(state.value()).toBeNull();
	});

	it('holds the figures of the last read', async () => {
		let count = 1;
		const state = new SummaryState({ read: () => Promise.resolve(count), onError: () => {} });

		await state.refresh();
		expect(state.value()).toBe(1);

		count = 2;
		await state.refresh();
		expect(state.value()).toBe(2);
	});

	it('drops the figures and reports the error when a read fails', async () => {
		const onError = jasmine.createSpy('onError');
		const reads = [Promise.resolve(1), Promise.reject(new Error('boom'))];
		const state = new SummaryState({ read: () => reads.shift()!, onError });

		await state.refresh();
		await state.refresh();

		expect(state.value()).toBeNull();
		expect(onError).toHaveBeenCalledOnceWith(new Error('boom'));
	});

	it('ignores a read that answers after a newer one', async () => {
		const first = deferred();
		const second = deferred();
		const reads = [first.promise, second.promise];
		const state = new SummaryState({ read: () => reads.shift()!, onError: () => {} });

		const olderRead = state.refresh();
		const newerRead = state.refresh();
		second.resolve(2);
		await newerRead;
		first.resolve(1);
		await olderRead;

		expect(state.value()).toBe(2);
	});
});
