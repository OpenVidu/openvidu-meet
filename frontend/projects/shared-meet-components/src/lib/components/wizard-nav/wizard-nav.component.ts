import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import type { WizardNavigationConfig, WizardNavigationEvent } from '../../models';

@Component({
	selector: 'ov-wizard-nav',
	standalone: true,
	imports: [CommonModule, MatButton, MatIcon],
	templateUrl: './wizard-nav.component.html',
	styleUrl: './wizard-nav.component.scss'
})
export class WizardNavComponent implements OnInit, OnChanges {
	/**
	 * Navigation configuration with default values
	 */
	@Input() config: WizardNavigationConfig = {
		showPrevious: true,
		showNext: true,
		showCancel: true,
		showFinish: false,
		nextLabel: 'Next',
		previousLabel: 'Previous',
		cancelLabel: 'Cancel',
		finishLabel: 'Finish',
		isNextDisabled: false,
		isPreviousDisabled: false,
		isFinishDisabled: false,
		isLoading: false,
		isCompact: false,
		ariaLabel: 'Wizard navigation'
	};

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
	@Output() finish = new EventEmitter<WizardNavigationEvent>();

	/**
	 * Generic navigation event for centralized handling
	 */
	@Output() navigate = new EventEmitter<WizardNavigationEvent>();

	ngOnInit() {
		this.validateConfig();
	}

	ngOnChanges(changes: SimpleChanges) {
		if (changes['config']) {
			this.validateConfig();
		}
	}

	/**
	 * Validates navigation configuration
	 */
	private validateConfig() {
		if (!this.config.nextLabel) this.config.nextLabel = 'Next';
		if (!this.config.previousLabel) this.config.previousLabel = 'Previous';
		if (!this.config.cancelLabel) this.config.cancelLabel = 'Cancel';
		if (!this.config.finishLabel) this.config.finishLabel = 'Finish';
	}

	/**
	 * Handle previous step navigation
	 */
	onPrevious() {
		if (!this.config.isPreviousDisabled && !this.config.isLoading) {
			const event: WizardNavigationEvent = {
				action: 'previous',
				currentStepId: this.currentStepId
			};

			this.previous.emit(event);
			this.navigate.emit(event);
		}
	}

	/**
	 * Handle next step navigation
	 */
	onNext() {
		if (!this.config.isNextDisabled && !this.config.isLoading) {
			const event: WizardNavigationEvent = {
				action: 'next',
				currentStepId: this.currentStepId
			};

			this.next.emit(event);
			this.navigate.emit(event);
		}
	}

	/**
	 * Handle wizard cancellation
	 */
	onCancel() {
		if (!this.config.isLoading) {
			const event: WizardNavigationEvent = {
				action: 'cancel',
				currentStepId: this.currentStepId
			};

			this.cancel.emit(event);
			this.navigate.emit(event);
		}
	}

	/**
	 * Handle wizard completion
	 */
	onFinish() {
		if (!this.config.isFinishDisabled && !this.config.isLoading) {
			const event: WizardNavigationEvent = {
				action: 'finish',
				currentStepId: this.currentStepId
			};

			this.finish.emit(event);
			this.navigate.emit(event);
		}
	}

	skipAndFinish() {
		const event: WizardNavigationEvent = {
			action: 'finish',
			currentStepId: this.currentStepId
		};
		this.finish.emit(event);
		this.navigate.emit(event);
	}
}
