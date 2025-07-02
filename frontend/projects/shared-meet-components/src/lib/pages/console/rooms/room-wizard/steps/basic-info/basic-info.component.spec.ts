import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomWizardBasicInfoComponent } from './basic-info.component';

describe('BasicInfoComponent', () => {
  let component: RoomWizardBasicInfoComponent;
  let fixture: ComponentFixture<RoomWizardBasicInfoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomWizardBasicInfoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomWizardBasicInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
