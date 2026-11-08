import { Component, forwardRef, input, signal } from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Option of a choice toggle; the label is a translation key. */
export interface ChoiceOption<T extends string> {
  value: T;
  icon: IconDefinition;
  label: string;
  disabled?: boolean;
}

let nextId = 0;

/**
 * Exclusive choice shown as a row of buttons (icon and text), for a few
 * options. Radio buttons underneath: keyboard arrows and screen readers work
 * as for any radio group.
 */
@Component({
  selector: 'app-choice-toggle',
  imports: [FaIconComponent, TranslocoPipe],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ChoiceToggle), multi: true }],
  template: `
    <div class="choices" role="radiogroup" [attr.aria-label]="label() | transloco">
      @for (option of options(); track option.value) {
        <label
          class="choice"
          [class.selected]="option.value === value()"
          [class.disabled]="option.disabled || disabled()"
        >
          <input
            type="radio"
            [name]="name"
            [value]="option.value"
            [checked]="option.value === value()"
            [disabled]="option.disabled || disabled()"
            (change)="choose(option.value)"
            (blur)="onTouched()"
          />
          <fa-icon [icon]="option.icon" />
          <span>{{ option.label | transloco }}</span>
        </label>
      }
    </div>
  `,
  styles: `
    .choices {
      display: inline-flex;
      flex-wrap: wrap;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .choice {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 0.8rem;
      cursor: pointer;
      color: var(--text);
      background: var(--surface);
      user-select: none;
    }
    .choice + .choice {
      border-left: 1px solid var(--border);
    }
    .choice:hover:not(.disabled, .selected) {
      background: var(--bg);
    }
    .choice.selected {
      color: var(--accent-contrast);
      background: var(--accent);
    }
    .choice.disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .choice:has(input:focus-visible) {
      outline: 2px solid var(--accent);
      outline-offset: -4px;
    }
  `,
})
export class ChoiceToggle<T extends string> implements ControlValueAccessor {
  readonly options = input.required<readonly ChoiceOption<T>[]>();
  /** Accessible name of the group (translation key). */
  readonly label = input.required<string>();

  protected readonly name = `choice-${nextId++}`;
  protected readonly value = signal<T | undefined>(undefined);
  protected readonly disabled = signal(false);
  private onChange: (value: T) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected choose(value: T): void {
    this.value.set(value);
    this.onChange(value);
  }

  writeValue(value: T): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: T) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
