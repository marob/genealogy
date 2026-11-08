import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideTestTransloco } from '../../testing/test-helpers';
import { type ChoiceOption, ChoiceToggle } from './choice-toggle';
import { iconChild, iconParents, iconUnion } from './icons';

@Component({
  imports: [ChoiceToggle, ReactiveFormsModule],
  template: `<app-choice-toggle [formControl]="control" label="contributions.relation" [options]="options" />`,
})
class Host {
  readonly control = new FormControl('child', { nonNullable: true });
  readonly options: ChoiceOption<string>[] = [
    { value: 'child', icon: iconChild, label: 'contributions.relations.child' },
    { value: 'parents', icon: iconParents, label: 'contributions.relations.parents', disabled: true },
    { value: 'spouse', icon: iconUnion, label: 'contributions.relations.spouse' },
  ];
}

describe('ChoiceToggle', () => {
  async function render() {
    TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const radios = () => [...element.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    return { fixture, element, radios };
  }

  it('shows the options as a labelled radio group', async () => {
    const { element, radios } = await render();
    const group = element.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('Lien de parenté');
    expect([...group.querySelectorAll('label')].map((label) => label.textContent.trim())).toEqual([
      'Enfant',
      'Parents',
      'Conjoint',
    ]);
    expect(radios().map((radio) => radio.checked)).toEqual([true, false, false]);
    expect(radios()[1]!.disabled).toBe(true);
    expect(element.querySelector('.selected')!.textContent.trim()).toBe('Enfant');
  });

  it('updates the form control, and follows it', async () => {
    const { fixture, element, radios } = await render();
    radios()[2]!.click();
    expect(fixture.componentInstance.control.value).toBe('spouse');

    fixture.componentInstance.control.setValue('child');
    fixture.detectChanges();
    expect(element.querySelector('.selected')!.textContent.trim()).toBe('Enfant');

    fixture.componentInstance.control.disable();
    fixture.detectChanges();
    expect(radios().every((radio) => radio.disabled)).toBe(true);
  });
});
