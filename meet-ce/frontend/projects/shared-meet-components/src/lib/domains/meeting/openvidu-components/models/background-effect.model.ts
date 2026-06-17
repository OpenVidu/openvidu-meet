/**
 * @internal
 */
export enum EffectType {
	NONE = 'NONE',
	BLUR = 'BLUR',
	IMAGE = 'IMAGE'
}

/**
 * @internal
 * Categories used to group the available background images in the panel.
 */
export enum BackgroundCategory {
	PROFESSIONAL = 'PROFESSIONAL',
	HOME_OFFICE = 'HOME_OFFICE',
	CREATIVE = 'CREATIVE'
}

/**
 * @internal
 */
export interface BackgroundEffect {
	id: string;
	type: EffectType;
	thumbnail: string;
	src?: string;
	category?: BackgroundCategory;
}
