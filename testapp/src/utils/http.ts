export interface RequestOptions {
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    body?: any;
}

async function buildUrl(url: string, queryParams?: Record<string, string>): Promise<string> {
    if (!queryParams) return url;
    const params = new URLSearchParams(queryParams as Record<string, string>).toString();
    return `${url}?${params}`;
}

async function request<T>(method: string, url: string, options: RequestOptions = {}): Promise<T> {
    const fullUrl = await buildUrl(url, options.queryParams);
    const fetchOptions: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        body: options.body ? JSON.stringify(options.body) : undefined
    };

    console.log(`Making ${method} request to: ${fullUrl}`);
    console.log('Request headers:', fetchOptions.headers);

    try {
        const response = await fetch(fullUrl, fetchOptions);

        console.log(`Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const text = await response.text();
            console.error(`HTTP Error ${response.status}:`, text);
            throw new Error(`HTTP ${response.status} (${response.statusText}): ${text || 'No response body'}`);
        }

        // Handle empty responses (e.g., for DELETE requests)
        const text = await response.text();
        if (!text) {
            console.log('Empty response received');
            return {} as T;
        }

        console.log('Response received successfully');
        return JSON.parse(text) as T;
    } catch (error) {
        console.error(`Request failed for ${method} ${fullUrl}:`, error);

        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error(`Network error: Unable to connect to ${fullUrl}. Check if the service is running.`);
        }

        throw error;
    }
}

export function get<T>(url: string, options?: Omit<RequestOptions, 'body'>): Promise<T> {
    return request<T>('GET', url, options || {});
}

export function post<T>(url: string, options?: Omit<RequestOptions, 'body'> & { body: any }): Promise<T> {
    return request<T>('POST', url, options as RequestOptions);
}

export function put<T>(url: string, options?: Omit<RequestOptions, 'body'> & { body: any }): Promise<T> {
    return request<T>('PUT', url, options as RequestOptions);
}

export function del<T>(url: string, options?: Omit<RequestOptions, 'body'>): Promise<T> {
    return request<T>('DELETE', url, options || {});
}
