import { AsyncLocalStorage } from 'async_hooks';
import type { RequestContext } from '../models/request-context.model.js';

/**
 * Shared AsyncLocalStorage holding per-request context.
 *
 * Lives in its own dependency-free module so both the RequestSessionService (which owns
 * the request lifecycle) and the LoggerService (which reads the correlation id at log time)
 * can use it without creating a circular dependency between them.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Returns the correlation id of the current HTTP request, or undefined when called outside
 * an HTTP request context (schedulers, webhooks, background jobs, startup).
 */
export const getCurrentRequestId = (): string | undefined => requestContextStorage.getStore()?.requestId;
