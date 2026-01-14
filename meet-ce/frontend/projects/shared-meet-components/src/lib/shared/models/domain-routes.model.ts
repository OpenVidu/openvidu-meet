import { Route } from '@angular/router';

/**
 * Navigation metadata for a domain route that should appear in the console navigation
 */
export interface DomainNavMetadata {
	/** Display label for the navigation link */
	label: string;
	/** Route path (relative to console) */
	route: string;
	/** Material icon name */
	icon: string;
	/** Optional CSS class for the icon */
	iconClass?: string;
	/** Optional order for sorting navigation items */
	order?: number;
}

/**
 * Complete route configuration for a domain
 * Includes both the route definition and optional navigation metadata
 */
export interface DomainRouteConfig {
	/** Angular route configuration */
	route: Route;
	/** Optional navigation metadata (if this route should appear in console nav) */
	navMetadata?: DomainNavMetadata;
}

/**
 * Domain routes registry
 * Maps domain identifiers to their route configurations
 */
export interface DomainRoutesRegistry {
	/** Console child routes (appear in the authenticated console area) */
	consoleRoutes: DomainRouteConfig[];
	/** Public routes (standalone routes outside console) */
	publicRoutes: DomainRouteConfig[];
}
