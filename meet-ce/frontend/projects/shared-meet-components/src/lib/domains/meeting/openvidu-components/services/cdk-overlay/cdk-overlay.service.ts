import { inject, Service } from '@angular/core';
import { CdkOverlayContainer } from '../../config/custom-cdk-overlay';

/**
 * @internal
 */
@Service()
export class CdkOverlayService {
	private readonly cdkOverlayModel = inject(CdkOverlayContainer);

	constructor() {}

	setSelector(selector: string) {
		this.cdkOverlayModel.setContainerSelector(selector);
	}
}
