import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomWizardRoomDetailsComponent } from './room-details.component';

describe('BasicInfoComponent', () => {
  let component: RoomWizardRoomDetailsComponent;
  let fixture: ComponentFixture<RoomWizardRoomDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomWizardRoomDetailsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomWizardRoomDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
