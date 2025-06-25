import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import type { WizardNavigationConfig } from '../../models';

@Component({
  selector: 'ov-wizard-nav',
  standalone: true,
  imports: [CommonModule, MatButton, MatIcon],
  templateUrl: './wizard-nav.component.html',
  styleUrl: './wizard-nav.component.scss'
})
export class WizardNavComponent {
  @Input() config: WizardNavigationConfig = {
    showPrevious: true,
    showNext: true,
    showCancel: true,
    showFinish: false,
    nextLabel: 'Next',
    previousLabel: 'Previous',
    isNextDisabled: false,
    isPreviousDisabled: false
  };

  @Output() previous = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() finish = new EventEmitter<void>();

  onPrevious() {
    if (!this.config.isPreviousDisabled) {
      this.previous.emit();
    }
  }

  onNext() {
    if (!this.config.isNextDisabled) {
      this.next.emit();
    }
  }

  onCancel() {
    this.cancel.emit();
  }

  onFinish() {
    this.finish.emit();
  }
}
