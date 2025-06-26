import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Subject, takeUntil } from 'rxjs';

import { RoomWizardStateService } from '../../../../../../services';

@Component({
  selector: 'ov-room-preferences',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule
  ],
  templateUrl: './room-preferences.component.html',
  styleUrl: './room-preferences.component.scss'
})
export class RoomPreferencesComponent implements OnInit, OnDestroy {
  preferencesForm: FormGroup;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private roomWizardStateService: RoomWizardStateService
  ) {
    this.preferencesForm = this.fb.group({
      chatEnabled: [true],
      virtualBackgroundsEnabled: [true]
    });
  }

  ngOnInit(): void {
    // Load existing data from wizard state
    const existingData = this.roomWizardStateService.getWizardData();
    if (existingData && existingData.preferences) {
      this.preferencesForm.patchValue(existingData.preferences);
    }

    // Auto-save form changes
    this.preferencesForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        this.roomWizardStateService.updateStepData('preferences', value);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onChatToggleChange(event: any): void {
    const isEnabled = event.checked;
    this.preferencesForm.patchValue({ chatEnabled: isEnabled });
  }

  onVirtualBackgroundToggleChange(event: any): void {
    const isEnabled = event.checked;
    this.preferencesForm.patchValue({ virtualBackgroundsEnabled: isEnabled });
  }

  get chatEnabled(): boolean {
    return this.preferencesForm.value.chatEnabled;
  }

  get virtualBackgroundsEnabled(): boolean {
    return this.preferencesForm.value.virtualBackgroundsEnabled;
  }
}
