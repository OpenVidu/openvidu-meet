import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';

const API_VERSION = 'v1';

@Injectable({
	providedIn: 'root'
})
export class HttpService {
	public static readonly API_PATH_PREFIX = `api/${API_VERSION}`;
	public static readonly INTERNAL_API_PATH_PREFIX = `internal-api/${API_VERSION}`;

	constructor(protected http: HttpClient) {}

	async getRequest<T>(path: string, headers?: Record<string, string>): Promise<T> {
		const options = headers ? { headers: new HttpHeaders(headers) } : {};
		return lastValueFrom(this.http.get<T>(path, options));
	}

	async postRequest<T>(path: string, body: any = {}, headers?: Record<string, string>): Promise<T> {
		const options = headers ? { headers: new HttpHeaders(headers) } : {};
		return lastValueFrom(this.http.post<T>(path, body, options));
	}

	async putRequest<T>(path: string, body: any = {}, headers?: Record<string, string>): Promise<T> {
		const options = headers ? { headers: new HttpHeaders(headers) } : {};
		return lastValueFrom(this.http.put<T>(path, body, options));
	}

	async patchRequest<T>(path: string, body: any = {}, headers?: Record<string, string>): Promise<T> {
		const options = headers ? { headers: new HttpHeaders(headers) } : {};
		return lastValueFrom(this.http.patch<T>(path, body, options));
	}

	async deleteRequest<T>(path: string, headers?: Record<string, string>): Promise<T> {
		const options = headers ? { headers: new HttpHeaders(headers) } : {};
		return lastValueFrom(this.http.delete<T>(path, options));
	}
}
