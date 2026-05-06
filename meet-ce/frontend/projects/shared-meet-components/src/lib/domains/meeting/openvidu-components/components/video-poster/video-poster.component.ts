import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
	selector: 'ov-video-poster',
	imports: [TranslatePipe],
	templateUrl: './video-poster.component.html',
	styleUrl: './video-poster.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class VideoPosterComponent {
	readonly nickname = input('');
	readonly color = input('#000000');
	readonly showAvatar = input(true);
	readonly hasEncryptionError = input(false);
	readonly letter = computed(() => this.nickname()?.[0] ?? '');
}
