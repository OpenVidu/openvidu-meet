
import { DOCUMENT } from '@angular/common';
import { Inject, inject, Injectable } from '@angular/core';
import { OpenViduComponentsConfig, ParticipantFactoryFunction } from '../../config/openvidu-components-angular.config';

/**
 * @internal
 */
@Injectable({
	providedIn: 'root'
})
export class GlobalConfigService {
	private readonly document = inject(DOCUMENT);
	private configuration: OpenViduComponentsConfig = {} as OpenViduComponentsConfig;

	constructor(@Inject('OPENVIDU_COMPONENTS_CONFIG') config: OpenViduComponentsConfig) {
		this.configuration = config;
		if (this.isProduction()) console.log('OpenVidu Angular Production Mode');
	}

	/**
	 * Retrieves the base href of the application.
	 *
	 * @returns The base href of the application as a string.
	 */
	getBaseHref(): string {
		const base = this.document.getElementsByTagName('base');
		if (!base || base.length === 0) {
			return '/';
		}

		const baseHref = base[0].href;
		if (baseHref) {
			return baseHref;
		}
		return '/';
	}

	hasParticipantFactory(): boolean {
		return typeof this.getConfig().participantFactory === 'function';
	}

	getParticipantFactory(): ParticipantFactoryFunction {
		const participantFactory = this.getConfig().participantFactory;
		if (!participantFactory) {
			throw new Error('Participant factory is not configured');
		}
		return participantFactory;
	}

	getConfig(): OpenViduComponentsConfig {
		return this.configuration;
	}
	isProduction(): boolean {
		return this.configuration?.production || false;
	}
}
