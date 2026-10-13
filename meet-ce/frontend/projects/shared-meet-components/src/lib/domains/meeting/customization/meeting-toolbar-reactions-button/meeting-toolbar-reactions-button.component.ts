import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
	afterNextRender,
	Component,
	DestroyRef,
	ElementRef,
	HostListener,
	inject,
	Injector,
	input,
	signal,
	TemplateRef,
	viewChild,
	ViewContainerRef
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetReaction } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ReactionComponent } from '../../openvidu-components/components/reaction/reaction.component';
import {
	REACTION_EMOJI,
	REACTION_LIFETIME_MS,
	REACTION_NAME_KEYS
} from '../../openvidu-components/models/reaction.model';
import { MeetingReactionsService } from '../../services/meeting-reactions.service';
import { isShortcut } from '../../utils/keyboard-shortcut.utils';

/** How long the pointer rests on the button before the picker opens, so crossing the toolbar opens nothing. */
const HOVER_OPEN_MS = 100;
/** How long the picker waits once the pointer leaves, so it can cross the gap between button and picker. */
const HOVER_CLOSE_MS = 300;

/**
 * The reaction picker. On desktop, a toolbar button whose picker opens on hover, on a click or with
 * `E`, in the same floating card as the microphone alerts; on mobile, a grid of reactions inside the
 * More options menu. Its visibility is decided by the parent (MeetingToolbarExtraButtonsComponent).
 */
@Component({
	selector: 'ov-meeting-toolbar-reactions-button',
	templateUrl: './meeting-toolbar-reactions-button.component.html',
	styleUrl: './meeting-toolbar-reactions-button.component.scss',
	imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, ReactionComponent, TranslatePipe]
})
export class MeetingToolbarReactionsButtonComponent {
	private readonly reactionsService = inject(MeetingReactionsService);
	private readonly overlay = inject(Overlay);
	private readonly viewContainerRef = inject(ViewContainerRef);
	private readonly injector = inject(Injector);

	/** Whether the toolbar is in its mobile layout, which shows the reactions as a grid of menu items */
	isMobile = input<boolean>(false);

	/** The local participant's reaction while it is on screen, which the button wears */
	localReaction = this.reactionsService.localReaction;
	readonly pickerOpen = signal(false);
	readonly reactions = Object.values(MeetReaction);
	readonly reactionEmoji = REACTION_EMOJI;
	readonly reactionNameKeys = REACTION_NAME_KEYS;
	readonly lifetimeSeconds = REACTION_LIFETIME_MS / 1000;

	private readonly button = viewChild('reactionsButton', { read: ElementRef<HTMLElement> });
	private readonly pickerTemplate = viewChild<TemplateRef<unknown>>('picker');
	private picker?: OverlayRef;
	private hoverTimer?: ReturnType<typeof setTimeout>;

	constructor() {
		inject(DestroyRef).onDestroy(() => this.closePicker());
	}

	/** `E` opens the picker and puts the keyboard on its first reaction. */
	@HostListener('document:keydown.e', ['$event'])
	onShortcut(event: Event): void {
		if (!isShortcut(event)) return;

		event.preventDefault();
		this.openPicker({ focus: true });
	}

	/** A click opens the picker as hovering does; from the keyboard, it also moves the focus into it. */
	onButtonClick(event: MouseEvent): void {
		this.openPicker({ focus: event.detail === 0 });
	}

	/** The pointer entering or leaving the button or the picker opens or closes it, after a short delay. */
	onHover(inside: boolean): void {
		clearTimeout(this.hoverTimer);
		this.hoverTimer = setTimeout(
			() => (inside ? this.openPicker() : this.closePicker()),
			inside ? HOVER_OPEN_MS : HOVER_CLOSE_MS
		);
	}

	/** Left and right move the focus along the reactions; the rest of the keys are read from the document. */
	onPickerKeydown(event: KeyboardEvent): void {
		const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
		const options = this.pickerOptions();
		const current = options.indexOf(event.target as HTMLElement);

		if (!step || current < 0) return;

		event.preventDefault();
		options[(current + step + options.length) % options.length].focus();
	}

	send(reaction: MeetReaction): void {
		this.reactionsService.send(reaction);
	}

	private openPicker({ focus = false } = {}): void {
		clearTimeout(this.hoverTimer);
		const origin = this.button()?.nativeElement;
		const template = this.pickerTemplate();

		if (!origin || !template) return;

		if (!this.picker) {
			const positionStrategy = this.overlay
				.position()
				.flexibleConnectedTo(origin)
				.withPositions([
					{ originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -12 },
					{ originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 12 }
				]);
			positionStrategy.positionChanges.subscribe(({ connectionPair }) =>
				this.pickerElement()?.classList.toggle('below', connectionPair.overlayY === 'top')
			);
			this.picker = this.overlay.create({
				positionStrategy,
				scrollStrategy: this.overlay.scrollStrategies.reposition()
			});
			this.picker.attach(new TemplatePortal(template, this.viewContainerRef));
			this.picker.outsidePointerEvents().subscribe((event) => {
				if (!origin.contains(event.target as Node)) this.closePicker();
			});
			document.addEventListener('keydown', this.pickerKeydown, true);
			this.pickerOpen.set(true);
		}

		// The picker renders on the next change detection, and the overlay can only centre it once it has a size.
		afterNextRender(
			() => {
				this.picker?.updatePosition();

				if (focus) this.pickerOptions()[0]?.focus();
			},
			{ injector: this.injector }
		);
	}

	private closePicker(): void {
		clearTimeout(this.hoverTimer);
		document.removeEventListener('keydown', this.pickerKeydown, true);
		this.picker?.dispose();
		this.picker = undefined;
		this.pickerOpen.set(false);
	}

	/** While the picker is open, `1` to `8` send the reaction in that place and `Escape` closes it. */
	private readonly pickerKeydown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape') {
			const focusInPicker = event.composedPath().includes(this.pickerElement() as EventTarget);
			this.closePicker();

			if (focusInPicker) this.button()?.nativeElement.focus();

			return;
		}

		const reaction = isShortcut(event) ? this.reactions[Number(event.key) - 1] : undefined;

		if (!reaction) return;

		event.preventDefault();
		this.closePicker();
		this.send(reaction);
	};

	private pickerElement(): HTMLElement | null | undefined {
		return this.picker?.overlayElement.querySelector<HTMLElement>('.reaction-picker');
	}

	private pickerOptions(): HTMLElement[] {
		return [...(this.pickerElement()?.querySelectorAll<HTMLElement>('.reaction-option') ?? [])];
	}
}
