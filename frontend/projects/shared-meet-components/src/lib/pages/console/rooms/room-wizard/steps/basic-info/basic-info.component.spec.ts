import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BasicInfoComponent } from './basic-info.component';

describe('BasicInfoComponent', () => {
  let component: BasicInfoComponent;
  let fixture: ComponentFixture<BasicInfoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BasicInfoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BasicInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
