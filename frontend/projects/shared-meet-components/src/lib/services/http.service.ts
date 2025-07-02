import { HttpClient } from '@angular/common/http';
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

	async getRequest<T>(path: string): Promise<T> {
		return lastValueFrom(this.http.get<T>(path));
	}

	async postRequest<T>(path: string, body: any = {}): Promise<T> {
		return lastValueFrom(this.http.post<T>(path, body));
	}

	async putRequest<T>(path: string, body: any = {}): Promise<T> {
		return lastValueFrom(this.http.put<T>(path, body));
	}

	async deleteRequest<T>(path: string): Promise<T> {
		return lastValueFrom(this.http.delete<T>(path, { observe: 'response' })).then((response) => ({
			...(response.body as T),
			statusCode: response.status
		}));
	}
}
