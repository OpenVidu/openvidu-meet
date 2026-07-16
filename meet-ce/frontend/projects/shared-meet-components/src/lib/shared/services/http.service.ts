import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { RuntimeConfigService } from './runtime-config.service';

const API_VERSION = 'v1';

@Service()
export class HttpService {
	public static readonly API_PATH_PREFIX = `api/${API_VERSION}`;
	public static readonly INTERNAL_API_PATH_PREFIX = `internal-api/${API_VERSION}`;
	readonly http = inject(HttpClient);
	private readonly runtimeConfig = inject(RuntimeConfigService);

	async getRequest<T>(path: string, headers?: Record<string, string>): Promise<T> {
		const options = headers ? { headers: new HttpHeaders(headers) } : {};
		return lastValueFrom(this.http.get<T>(this.runtimeConfig.resolveUrl(path), options));
	}

	async postRequest<T>(path: string, body: any = {}, headers?: Record<string, string>): Promise<T> {
		const options = headers ? { headers: new HttpHeaders(headers) } : {};
		return lastValueFrom(this.http.post<T>(this.runtimeConfig.resolveUrl(path), body, options));
	}

	async putRequest<T>(path: string, body: any = {}, headers?: Record<string, string>): Promise<T> {
		const options = headers ? { headers: new HttpHeaders(headers) } : {};
		return lastValueFrom(this.http.put<T>(this.runtimeConfig.resolveUrl(path), body, options));
	}

	async patchRequest<T>(path: string, body: any = {}, headers?: Record<string, string>): Promise<T> {
		const options = headers ? { headers: new HttpHeaders(headers) } : {};
		return lastValueFrom(this.http.patch<T>(this.runtimeConfig.resolveUrl(path), body, options));
	}

	async deleteRequest<T>(path: string, headers?: Record<string, string>): Promise<T> {
		const options = headers ? { headers: new HttpHeaders(headers) } : {};
		return lastValueFrom(this.http.delete<T>(this.runtimeConfig.resolveUrl(path), options));
	}
}
