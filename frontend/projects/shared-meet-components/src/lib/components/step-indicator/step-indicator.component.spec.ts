import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StepIndicatorComponent } from './step-indicator.component';

describe('StepIndicatorComponent', () => {
  let component: StepIndicatorComponent;
  let fixture: ComponentFixture<StepIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StepIndicatorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StepIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
