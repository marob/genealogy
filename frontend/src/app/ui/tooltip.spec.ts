import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Tooltip } from './tooltip';

@Component({
  imports: [Tooltip],
  template: `
    <button type="button" appTooltip="Details" aria-describedby="other">Open</button>
    <button type="button" appTooltip="Close" aria-label="Close">×</button>
  `,
})
class Host {}

describe('Tooltip', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
  }

  it('describes its trigger while shown', async () => {
    const [button] = render();
    button!.dispatchEvent(new FocusEvent('focusin'));
    await TestBed.inject(ApplicationRef).whenStable();
    const ids = button!.getAttribute('aria-describedby')!.split(' ');
    expect(ids[0]).toBe('other');
    const tooltip = document.getElementById(ids[1]!)!;
    expect(tooltip.getAttribute('role')).toBe('tooltip');
    expect(tooltip.textContent.trim()).toBe('Details');

    button!.dispatchEvent(new FocusEvent('focusout'));
    expect(button!.getAttribute('aria-describedby')).toBe('other');
  });

  it('does not repeat the accessible name of its trigger', () => {
    const [, button] = render();
    button!.dispatchEvent(new FocusEvent('focusin'));
    expect(button!.hasAttribute('aria-describedby')).toBe(false);
  });
});
