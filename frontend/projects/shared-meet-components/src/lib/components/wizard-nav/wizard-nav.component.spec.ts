import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WizardNavComponent } from './wizard-nav.component';

describe('WizardNavComponent', () => {
  let component: WizardNavComponent;
  let fixture: ComponentFixture<WizardNavComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WizardNavComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WizardNavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
