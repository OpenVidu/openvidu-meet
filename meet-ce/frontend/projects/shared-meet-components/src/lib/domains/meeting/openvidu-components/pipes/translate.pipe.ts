import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '../services/translate/translate.service';

/**
 * @internal
 */
@Pipe({
	name: 'translate',
	pure: false,
	standalone: true
})
export class TranslatePipe implements PipeTransform {
	private readonly translateService = inject(TranslateService);

	transform(str: string): string {
		return this.translateService.translate(str);

	}
}
