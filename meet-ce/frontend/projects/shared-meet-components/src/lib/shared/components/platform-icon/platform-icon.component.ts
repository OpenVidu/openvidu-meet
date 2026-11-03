import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { BROADCAST_PLATFORM_LABELS, BroadcastPlatform } from '../../models/broadcast.model';

// Each platform's official logo, taken unmodified from its brand kit, and the tile it sits on.
const INSTAGRAM_GLYPH =
	'M66.004 18c-13.036 0-14.672.057-19.792.29-5.11.234-8.598 1.043-11.65 2.23-3.157 1.226-5.835 2.866-8.503 5.535-2.67 2.668-4.31 5.346-5.54 8.502-1.19 3.053-2 6.542-2.23 11.65C18.06 51.327 18 52.964 18 66s.058 14.667.29 19.787c.235 5.11 1.044 8.598 2.23 11.65 1.227 3.157 2.867 5.835 5.536 8.503 2.667 2.67 5.345 4.314 8.5 5.54 3.054 1.187 6.543 1.996 11.652 2.23 5.12.233 6.755.29 19.79.29 13.037 0 14.668-.057 19.788-.29 5.11-.234 8.602-1.043 11.656-2.23 3.156-1.226 5.83-2.87 8.497-5.54 2.67-2.668 4.31-5.346 5.54-8.502 1.18-3.053 1.99-6.542 2.23-11.65.23-5.12.29-6.752.29-19.788 0-13.036-.06-14.672-.29-19.792-.24-5.11-1.05-8.598-2.23-11.65-1.23-3.157-2.87-5.835-5.54-8.503-2.67-2.67-5.34-4.31-8.5-5.535-3.06-1.187-6.55-1.996-11.66-2.23-5.12-.233-6.75-.29-19.79-.29zm-4.306 8.65c1.278-.002 2.704 0 4.306 0 12.816 0 14.335.046 19.396.276 4.68.214 7.22.996 8.912 1.653 2.24.87 3.837 1.91 5.516 3.59 1.68 1.68 2.72 3.28 3.592 5.52.657 1.69 1.44 4.23 1.653 8.91.23 5.06.28 6.58.28 19.39s-.05 14.33-.28 19.39c-.214 4.68-.996 7.22-1.653 8.91-.87 2.24-1.912 3.835-3.592 5.514-1.68 1.68-3.275 2.72-5.516 3.59-1.69.66-4.232 1.44-8.912 1.654-5.06.23-6.58.28-19.396.28-12.817 0-14.336-.05-19.396-.28-4.68-.216-7.22-.998-8.913-1.655-2.24-.87-3.84-1.91-5.52-3.59-1.68-1.68-2.72-3.276-3.592-5.517-.657-1.69-1.44-4.23-1.653-8.91-.23-5.06-.276-6.58-.276-19.398s.046-14.33.276-19.39c.214-4.68.996-7.22 1.653-8.912.87-2.24 1.912-3.84 3.592-5.52 1.68-1.68 3.28-2.72 5.52-3.592 1.692-.66 4.233-1.44 8.913-1.655 4.428-.2 6.144-.26 15.09-.27zm29.928 7.97c-3.18 0-5.76 2.577-5.76 5.758 0 3.18 2.58 5.76 5.76 5.76 3.18 0 5.76-2.58 5.76-5.76 0-3.18-2.58-5.76-5.76-5.76zm-25.622 6.73c-13.613 0-24.65 11.037-24.65 24.65 0 13.613 11.037 24.645 24.65 24.645C79.617 90.645 90.65 79.613 90.65 66S79.616 41.35 66.003 41.35zm0 8.65c8.836 0 16 7.163 16 16 0 8.836-7.164 16-16 16-8.837 0-16-7.164-16-16 0-8.837 7.163-16 16-16z';

/** How much of the tile the glyph takes, and its height for that width. */
const GLYPH_SIZES: Record<BroadcastPlatform, { width: number; ratio: number }> = {
	youtube: { width: 0.64, ratio: 20 / 28.57 },
	facebook: { width: 0.62, ratio: 1 },
	twitch: { width: 0.5, ratio: 2800 / 2400 },
	instagram: { width: 0.6, ratio: 1 },
	x: { width: 0.5, ratio: 1227 / 1200 },
	kick: { width: 0.46, ratio: 510.6 / 453.9 },
	vimeo: { width: 0.56, ratio: 300 / 333 },
	other: { width: 0.56, ratio: 1 }
};

/**
 * The logo of the platform a broadcast destination streams to, on a tile sized by `size`. Every logo
 * is inline SVG, so it renders inside the webcomponent's shadow DOM without loading assets.
 */
@Component({
	selector: 'ov-platform-icon',
	imports: [MatIconModule],
	template: `
		<span
			class="platform-tile"
			[class]="'platform-' + platform()"
			[style.width.px]="size()"
			[style.height.px]="size()"
			[style.border-radius.px]="radius()"
			role="img"
			[attr.aria-label]="label()"
		>
			@switch (platform()) {
				@case ('youtube') {
					<svg
						viewBox="0 0 28.57 20"
						[style.width.px]="glyphWidth()"
						[style.height.px]="glyphHeight()"
						aria-hidden="true"
					>
						<path
							d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 0 14.285 0 14.285 0C14.285 0 5.35042 0 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C0 5.35042 0 10 0 10C0 10 0 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z"
							fill="#FF0000"
						/>
						<path d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z" fill="#FFFFFF" />
					</svg>
				}
				@case ('facebook') {
					<svg
						viewBox="0 0 500 500"
						[style.width.px]="glyphWidth()"
						[style.height.px]="glyphHeight()"
						aria-hidden="true"
					>
						<g transform="matrix(1,0,0,-1,0,500)">
							<path
								transform="translate(500,250)"
								d="m 0,0 c 0,138.071 -111.929,250 -250,250 -138.071,0 -250,-111.929 -250,-250 0,-117.245 80.715,-215.622 189.606,-242.638 v 166.242 h -51.552 V 0 h 51.552 v 32.919 c 0,85.092 38.508,124.532 122.048,124.532 15.838,0 43.167,-3.105 54.347,-6.211 V 81.986 c -5.901,0.621 -16.149,0.932 -28.882,0.932 -40.993,0 -56.832,-15.528 -56.832,-55.9 V 0 h 81.659 l -14.028,-76.396 h -67.631 V -248.169 C -95.927,-233.218 0,-127.818 0,0"
								fill="#0866FF"
							/>
							<path
								transform="translate(347.9175,173.6036)"
								d="M 0,0 14.029,76.396 H -67.63 v 27.019 c 0,40.372 15.838,55.899 56.831,55.899 12.733,0 22.981,-0.31 28.882,-0.931 v 69.253 c -11.18,3.106 -38.509,6.212 -54.347,6.212 -83.539,0 -122.048,-39.441 -122.048,-124.533 V 76.396 h -51.552 V 0 h 51.552 v -166.242 c 19.343,-4.798 39.568,-7.362 60.394,-7.362 10.254,0 20.358,0.632 30.288,1.831 L -67.63,0 Z"
								fill="#FFFFFF"
							/>
						</g>
					</svg>
				}
				@case ('twitch') {
					<svg
						viewBox="0 0 2400 2800"
						[style.width.px]="glyphWidth()"
						[style.height.px]="glyphHeight()"
						aria-hidden="true"
					>
						<polygon
							points="2200,1300 1800,1700 1400,1700 1050,2050 1050,1700 600,1700 600,200 2200,200"
							fill="#FFFFFF"
						/>
						<path
							d="M500,0L0,500v1800h600v500l500-500h400l900-900V0H500z M2200,1300l-400,400h-400l-350,350v-350H600V200h1600V1300z"
							fill="#9146FF"
						/>
						<rect x="1700" y="550" width="200" height="600" fill="#9146FF" />
						<rect x="1150" y="550" width="200" height="600" fill="#9146FF" />
					</svg>
				}
				@case ('instagram') {
					<svg
						viewBox="18 18 96 96"
						[style.width.px]="glyphWidth()"
						[style.height.px]="glyphHeight()"
						aria-hidden="true"
					>
						<defs>
							<radialGradient
								id="ov-platform-instagram-warm"
								cx="158.429"
								cy="578.088"
								r="65"
								gradientUnits="userSpaceOnUse"
								gradientTransform="matrix(0 -1.98198 1.8439 0 -1031.402 454.004)"
							>
								<stop offset="0" stop-color="#FFDD55" />
								<stop offset="0.1" stop-color="#FFDD55" />
								<stop offset="0.5" stop-color="#FF543E" />
								<stop offset="1" stop-color="#C837AB" />
							</radialGradient>
							<radialGradient
								id="ov-platform-instagram-cool"
								cx="147.694"
								cy="473.455"
								r="65"
								gradientUnits="userSpaceOnUse"
								gradientTransform="matrix(0.17394 0.86872 -3.5818 0.71718 1648.348 -458.493)"
							>
								<stop offset="0" stop-color="#3771C8" />
								<stop offset="0.128" stop-color="#3771C8" />
								<stop offset="1" stop-color="#6600FF" stop-opacity="0" />
							</radialGradient>
						</defs>
						<path fill="url(#ov-platform-instagram-warm)" [attr.d]="instagramGlyph" />
						<path fill="url(#ov-platform-instagram-cool)" [attr.d]="instagramGlyph" />
					</svg>
				}
				@case ('x') {
					<svg
						viewBox="0 0 1200 1227"
						[style.width.px]="glyphWidth()"
						[style.height.px]="glyphHeight()"
						aria-hidden="true"
					>
						<path
							d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z"
							fill="currentColor"
						/>
					</svg>
				}
				@case ('kick') {
					<svg
						viewBox="0 0 453.9 510.6"
						[style.width.px]="glyphWidth()"
						[style.height.px]="glyphHeight()"
						aria-hidden="true"
					>
						<path
							d="M0,0h170.2v113.5h56.7v-56.7h56.7V0h170.2v170.2h-56.7v56.7h-56.7v56.7h56.7v56.7h56.7v170.2h-170.2v-56.7h-56.7v-56.7h-56.7v113.5H0V0Z"
							fill="#53FC18"
							fill-rule="evenodd"
						/>
					</svg>
				}
				@case ('vimeo') {
					<svg
						viewBox="0 0 333 300"
						[style.width.px]="glyphWidth()"
						[style.height.px]="glyphHeight()"
						aria-hidden="true"
					>
						<path
							d="M283.836 0C222.17 0 192.975 79.7255 192.975 79.7255L197.747 86.65C203.221 83.3749 209.771 79.7255 217.351 79.7255C225.585 79.7255 232.416 85.8079 232.416 101.856C232.416 128.431 202.051 193.746 174.774 193.746C162.656 193.746 157.229 174.095 149.369 138.584C146.702 128.197 142.023 101.575 135.239 58.8116C128.923 19.1828 124.431 3.32189 102.067 3.32189C50.7413 3.32189 0.35144 74.8128 0.35144 74.8128L7.65026 90.0187C13.1244 86.7436 19.6278 83.0474 29.1724 83.0474C47.3727 83.0474 49.1974 103.26 59.6309 140.689C69.0352 175.031 78.299 208.765 87.8437 243.715C97.435 278.665 117.132 300 141.368 300C177.722 300 212.719 269.167 260.255 207.642C282.385 179.289 305.685 141.204 317.897 114.395C330.249 87.3518 332.307 64.3325 332.307 53.7586C332.307 23.0661 320.189 0 283.836 0Z"
							fill="#17D5FF"
						/>
					</svg>
				}
				@default {
					<mat-icon
						[style.font-size.px]="glyphWidth()"
						[style.width.px]="glyphWidth()"
						[style.height.px]="glyphWidth()"
						aria-hidden="true"
						>sensors</mat-icon
					>
				}
			}
		</span>
	`,
	styles: `
		:host {
			display: inline-flex;
			flex-shrink: 0;
		}

		.platform-tile {
			display: flex;
			align-items: center;
			justify-content: center;
			box-sizing: border-box;
			flex-shrink: 0;
			overflow: hidden;
		}

		svg {
			display: block;
		}

		.platform-youtube,
		.platform-facebook,
		.platform-twitch,
		.platform-instagram {
			background: #ffffff;
			border: 1px solid rgba(0, 0, 0, 0.12);
		}

		.platform-x {
			background: #ffffff;
			color: #000000;
			border: 1px solid rgba(0, 0, 0, 0.12);
		}

		.platform-kick {
			background: #000000;
		}

		.platform-vimeo {
			background: #141a20;
		}

		.platform-other {
			background: color-mix(in srgb, currentColor 12%, transparent);
			color: inherit;
		}

		.platform-other mat-icon {
			display: flex;
			align-items: center;
			justify-content: center;
		}

		@media (prefers-color-scheme: dark) {
			.platform-x {
				background: #000000;
				color: #ffffff;
				border-color: rgba(255, 255, 255, 0.25);
			}
		}
	`
})
export class PlatformIconComponent {
	readonly platform = input<BroadcastPlatform>('other');
	readonly size = input(36);

	protected readonly instagramGlyph = INSTAGRAM_GLYPH;
	protected readonly label = computed(() => BROADCAST_PLATFORM_LABELS[this.platform()]);
	protected readonly radius = computed(() => Math.round(this.size() * 0.22));
	protected readonly glyphWidth = computed(() => Math.round(this.size() * GLYPH_SIZES[this.platform()].width));
	protected readonly glyphHeight = computed(() => Math.round(this.glyphWidth() * GLYPH_SIZES[this.platform()].ratio));
}
