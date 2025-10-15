import { Request } from 'express';
import { injectable } from 'inversify';
import { SERVER_PORT } from '../environment.js';

@injectable()
export class HttpContextService {
	private baseUrl: string;

	constructor() {
		this.baseUrl = this.getDefaultBaseUrl();
	}

	/**
	 * Sets the current HTTP context from the request
	 */
	setContext(req: Request): void {
		const protocol = req.protocol;
		const host = req.get('host');
		this.baseUrl = `${protocol}://${host}`;
	}

	/**
	 * Gets the base URL from the current context
	 */
	getBaseUrl(): string {
		return this.baseUrl;
	}

	/**
	 * Clears the current context
	 */
	clearContext(): void {
		this.baseUrl = this.getDefaultBaseUrl();
	}

	private getDefaultBaseUrl(): string {
		return `http://localhost:${SERVER_PORT}`;
	}
}
