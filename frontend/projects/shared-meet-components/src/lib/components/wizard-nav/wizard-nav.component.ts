import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import type { WizardNavigationConfig, WizardNavigationEvent } from '@lib/models';

@Component({
    selector: 'ov-wizard-nav',
    imports: [MatButton, MatIcon],
    templateUrl: './wizard-nav.component.html',
    styleUrl: './wizard-nav.component.scss'
})
export class WizardNavComponent {
	/**
	 * Navigation configuration with default values
	 */
	@Input() config: WizardNavigationConfig = {
		showPrevious: false,
		showNext: true,
		showCancel: false,
		showBack: true,
		showFinish: false,
		showSkipAndFinish: false,
		disableFinish: false,
		nextLabel: 'Next',
		previousLabel: 'Previous',
		cancelLabel: 'Cancel',
		finishLabel: 'Finish'
	};

	@Input() backButtonText: string = 'Back';

	/**
	 * Current step identifier for context
	 */
	@Input() currentStepId?: number;

	/**
	 * Event emitters for navigation actions
	 */
	@Output() previous = new EventEmitter<WizardNavigationEvent>();
	@Output() next = new EventEmitter<WizardNavigationEvent>();
	@Output() cancel = new EventEmitter<WizardNavigationEvent>();
	@Output() back = new EventEmitter<WizardNavigationEvent>();
	@Output() finish = new EventEmitter<WizardNavigationEvent>();

	/**
	 * Generic navigation event for centralized handling
	 */
	@Output() navigate = new EventEmitter<WizardNavigationEvent>();

	onPrevious() {
		if (!this.config.showPrevious) return;

		const event: WizardNavigationEvent = {
			action: 'previous',
			currentStepIndex: this.currentStepId
		};
		this.previous.emit(event);
		this.navigate.emit(event);
	}

	onNext() {
		if (!this.config.showNext) return;

		const event: WizardNavigationEvent = {
			action: 'next',
			currentStepIndex: this.currentStepId
		};
		this.next.emit(event);
		this.navigate.emit(event);
	}

	onCancel() {
		if (!this.config.showCancel) return;

		const event: WizardNavigationEvent = {
			action: 'cancel',
			currentStepIndex: this.currentStepId
		};
		this.cancel.emit(event);
		this.navigate.emit(event);
	}

	onBack() {
		if (!this.config.showBack) return;
		const event: WizardNavigationEvent = {
			action: 'back',
			currentStepIndex: this.currentStepId
		};
		this.back.emit(event);
		this.navigate.emit(event);
	}

	onFinish() {
		if (!this.config.showFinish) return;

		const event: WizardNavigationEvent = {
			action: 'finish',
			currentStepIndex: this.currentStepId
		};
		this.finish.emit(event);
		this.navigate.emit(event);
	}

	skipAndFinish() {
		if (!this.config.showSkipAndFinish) return;

		const event: WizardNavigationEvent = {
			action: 'finish',
			currentStepIndex: this.currentStepId
		};
		this.finish.emit(event);
		this.navigate.emit(event);
	}
}
