import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Params, Router } from '@angular/router';
import { map, skip } from 'rxjs';

/** How one filter field maps to a query parameter. */
export interface ListUrlParam<TValue> {
	/** Query parameter name; defaults to the field name. */
	param?: string;
	/** Accepted values of a text field; anything else falls back to the default. */
	allowed?: readonly TValue[];
}

/** The query parameter of every field of a list's filters. */
export type ListUrlParams<TFilter> = { [K in keyof TFilter]?: ListUrlParam<TFilter[K]> };

/**
 * The search, filters and order of a list page, kept in the URL query string so the address always
 * describes what the page shows: it survives a reload, can be shared and follows the browser's back
 * and forward buttons. A field at its default value is left out of the URL.
 *
 * Create it in the page's field initializers: it injects the router and the route.
 */
export class ListUrlState<TFilter extends object> {
	private readonly router = inject(Router);
	private readonly route = inject(ActivatedRoute);
	private readonly destroyRef = inject(DestroyRef);

	constructor(
		readonly defaults: TFilter,
		private readonly params: ListUrlParams<TFilter> = {}
	) {}

	/** The filters the current URL describes. */
	get current(): TFilter {
		return this.parse(this.route.snapshot.queryParamMap);
	}

	/** Calls `handler` with the filters of every URL change after the current one, until the page is destroyed. */
	onChange(handler: (filters: TFilter) => void): void {
		this.route.queryParamMap
			.pipe(
				skip(1),
				map((params) => this.parse(params)),
				takeUntilDestroyed(this.destroyRef)
			)
			.subscribe(handler);
	}

	/** Puts the filters in the URL, as a new history entry. */
	write(filters: TFilter): void {
		const queryParams: Params = {};

		for (const key of this.keys()) {
			const value = filters[key];
			queryParams[this.paramName(key)] = value === this.defaults[key] ? null : String(value);
		}

		void this.router.navigate([], { relativeTo: this.route, queryParams });
	}

	private parse(params: ParamMap): TFilter {
		const filters = { ...this.defaults };

		for (const key of this.keys()) {
			const raw = params.get(this.paramName(key));
			const fallback = this.defaults[key];

			if (raw === null) continue;

			if (typeof fallback === 'boolean') {
				filters[key] = (raw === 'true') as TFilter[typeof key];
			} else if (this.params[key]?.allowed?.includes(raw as TFilter[typeof key]) ?? true) {
				filters[key] = raw as TFilter[typeof key];
			}
		}

		return filters;
	}

	private keys(): (keyof TFilter)[] {
		return Object.keys(this.defaults) as (keyof TFilter)[];
	}

	private paramName(key: keyof TFilter): string {
		return this.params[key]?.param ?? String(key);
	}
}
