import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '../services/translate/translate.service';

/**
 * @internal
 */
@Pipe({
	name: 'translate',
	pure: false
})
export class TranslatePipe implements PipeTransform {
	private readonly translateService = inject(TranslateService);

	transform(str: string): string {
		const translation = this.translateService.translate(str);
		if (translation?.includes('OpenVidu PRO')) {
			return translation.replace(
				'OpenVidu PRO',
				'<a href="https://openvidu.io/pricing/#openvidu-pro" target="_blank">OpenVidu PRO</a>'
			);
		}
		return translation;
	}
}
