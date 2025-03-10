import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectionCardComponent } from './selection-card.component';

describe('SelectionCardComponent', () => {
  let component: SelectionCardComponent;
  let fixture: ComponentFixture<SelectionCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectionCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelectionCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
