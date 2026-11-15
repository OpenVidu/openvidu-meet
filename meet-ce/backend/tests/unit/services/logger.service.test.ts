import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LoggerService } from '../../../src/services/logger.service.js';

describe('LoggerService', () => {
	let service: LoggerService;
	let formatLogEntry: jest.SpiedFunction<typeof service.logger.format.transform>;

	beforeEach(() => {
		service = new LoggerService();
		service.logger.level = 'info';
		service.logger.transports.forEach((transport) => (transport.silent = true));
		formatLogEntry = jest.spyOn(service.logger.format, 'transform');
	});

	it('does not format an entry below the configured level', () => {
		service.verbose('discarded', { roomId: 'room' });
		service.debug('discarded');
		service.silly('discarded');

		expect(formatLogEntry).not.toHaveBeenCalled();
	});

	it('formats an entry at or above the configured level', () => {
		service.info('kept');
		service.warn('kept');
		service.error('kept');

		expect(formatLogEntry).toHaveBeenCalledTimes(3);
	});
});
