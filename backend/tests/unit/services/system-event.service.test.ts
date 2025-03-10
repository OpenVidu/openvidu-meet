// tests/integration/services/system-event.service.test.ts

import 'reflect-metadata';
import { Container } from 'inversify';
import { SystemEventService } from '../../../src/services/system-event.service';
import { RedisService } from '../../../src/services/redis.service';
import { LoggerService } from '../../../src/services/logger.service';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('SystemEventService', () => {
	let container: Container;
	let systemEventService: SystemEventService;
	let redisServiceMock: jest.Mocked<RedisService>;
	let loggerMock: jest.Mocked<LoggerService>;

	beforeEach(() => {
		// Crear mocks para RedisService y LoggerService
		redisServiceMock = {
			onReady: jest.fn()
			// Añadir otros métodos de RedisService si existen
		} as unknown as jest.Mocked<RedisService>;

		loggerMock = {
			verbose: jest.fn(),
			error: jest.fn()
			// Añadir otros métodos de LoggerService si existen
		} as unknown as jest.Mocked<LoggerService>;

		// Configurar el contenedor
		container = new Container();
		container.bind<LoggerService>(LoggerService).toConstantValue(loggerMock);
		container.bind<RedisService>(RedisService).toConstantValue(redisServiceMock);
		container.bind<SystemEventService>(SystemEventService).toSelf();

		// Obtener instancia del servicio
		systemEventService = container.get(SystemEventService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('debería registrar el callback en RedisService.onReady', () => {
		const callback = jest.fn();

		systemEventService.onRedisReady(callback);

		expect(redisServiceMock.onReady).toHaveBeenCalledWith(callback);
	});

	it('puede registrar múltiples callbacks en RedisService.onReady', () => {
		const callback1 = jest.fn();
		const callback2 = jest.fn();

		systemEventService.onRedisReady(callback1);
		systemEventService.onRedisReady(callback2);

		expect(redisServiceMock.onReady).toHaveBeenCalledTimes(2);
		expect(redisServiceMock.onReady).toHaveBeenCalledWith(callback1);
		expect(redisServiceMock.onReady).toHaveBeenCalledWith(callback2);
	});

	it('debería manejar errores al registrar callbacks', () => {
		const callback = jest.fn();
		const error = new Error('Error al registrar el callback');

		redisServiceMock.onReady.mockImplementationOnce(() => {
			throw error;
		});

		expect(() => systemEventService.onRedisReady(callback)).toThrow(error);
		expect(redisServiceMock.onReady).toHaveBeenCalledWith(callback);
	});
});
