import { injectable } from 'inversify';
import winston from 'winston';
import { MEET_ENV } from '../environment.js';
import { getCurrentRequestId } from '../utils/request-context.utils.js';

/**
 * Stamps the current request's correlation id onto the log info object.
 *
 * This is deliberately a LOGGER-level format: winston runs it synchronously within the
 * log() call, i.e. still inside the request's AsyncLocalStorage context, so the id is
 * captured reliably. Reading the id inside a transport's printf instead does NOT work —
 * winston executes transport formats after the entry has crossed the stream pipeline, by
 * which point the async context (and therefore the request id) is gone.
 */
const stampRequestId = winston.format((info) => {
	const requestId = getCurrentRequestId();

	if (requestId) {
		info.requestId = requestId;
	}

	return info;
});

/**
 * Renders a single log line. The correlation id is read from the (already stamped) info
 * object rather than from the async context, so it is safe to run at transport time.
 */
const buildLogLine = (info: winston.Logform.TransformableInfo): string => {
	const metadata = info.metadata;
	const meta =
		typeof metadata === 'object' && metadata !== null && Object.keys(metadata).length
			? JSON.stringify(metadata)
			: '';
	const requestId = info.requestId;
	const requestIdPart = typeof requestId === 'string' ? ` | ${requestId}` : '';
	return `${String(info.timestamp)} | ${MEET_ENV.EDITION}${requestIdPart} | [${info.level}] ${String(info.message)} ${meta}`;
};

@injectable()
export class LoggerService {
	public readonly logger: winston.Logger;

	constructor() {
		this.logger = winston.createLogger({
			level: MEET_ENV.LOG_LEVEL,
			format: winston.format.combine(
				stampRequestId(),
				winston.format.timestamp({
					format: 'YYYY-MM-DD HH:mm:ss'
				}),
				winston.format.printf(buildLogLine),
				winston.format.errors({ stack: true })
			),
			transports: [
				new winston.transports.Console({
					format: winston.format.combine(
						winston.format.colorize(),
						winston.format.timestamp({
							format: 'YYYY-MM-DD HH:mm:ss'
						}),
						// Keep requestId at the top level so buildLogLine can read it; everything else
						// collapses into the metadata blob.
						winston.format.metadata({
							fillExcept: ['message', 'level', 'timestamp', 'label', 'requestId']
						}),
						winston.format.printf(buildLogLine)
					)
				})
			]
		});
	}

	// Generic method to log messages with a specific level
	protected log(level: string, message: string, ...meta: unknown[]): void {
		this.logger.log(level, message, ...meta);
	}

	// Logs a message as an error
	public error(message: string, ...meta: unknown[]): void {
		this.log('error', message, ...meta);
	}

	// Logs a message as a warning
	public warn(message: string, ...meta: unknown[]): void {
		this.log('warn', message, ...meta);
	}

	// Logs a message as general information
	public info(message: string, ...meta: unknown[]): void {
		this.log('info', message, ...meta);
	}

	// Logs a message as verbose
	public verbose(message: string, ...meta: unknown[]): void {
		this.log('verbose', message, ...meta);
	}

	// Logs a message for debugging purposes
	public debug(message: string, ...meta: unknown[]): void {
		this.log('debug', message, ...meta);
	}

	// Logs a message as trivial information
	public silly(message: string, ...meta: unknown[]): void {
		this.log('silly', message, ...meta);
	}
}
