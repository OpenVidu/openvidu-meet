import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomWizardComponent } from './room-wizard.component';

describe('RoomWizardComponent', () => {
  let component: RoomWizardComponent;
  let fixture: ComponentFixture<RoomWizardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomWizardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
