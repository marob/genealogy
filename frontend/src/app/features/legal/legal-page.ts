import { DOCUMENT } from '@angular/common';
import { afterRenderEffect, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SessionStore } from '../../core/session.store';

const SECTIONS = {
  privacy: ['collected', 'purpose', 'cookies', 'genealogy', 'retention', 'deletion', 'rights'],
  terms: ['access', 'content', 'liability'],
} as const;

/** Privacy policy and terms of use (required by the identity providers). */
@Component({
  selector: 'app-legal-page',
  imports: [TranslocoPipe],
  template: `
    @let key = 'legal.' + page();
    <article class="card">
      <h1>{{ key + '.title' | transloco }}</h1>
      <p class="muted">{{ 'legal.updated' | transloco }}</p>
      <p>{{ key + '.intro' | transloco }}</p>
      @for (section of sections(); track section) {
        <section [id]="section">
          <h2>{{ key + '.' + section + '.title' | transloco }}</h2>
          <p>{{ key + '.' + section + '.body' | transloco }}</p>
        </section>
      }
      @if (page() === 'terms') {
        <section id="source">
          <h2>{{ 'legal.terms.source.title' | transloco }}</h2>
          <p>
            {{ 'legal.terms.source.body' | transloco }}
            <a href="https://github.com/marob/genealogy" rel="noopener">github.com/marob/genealogy</a>
          </p>
        </section>
      }
      <section id="contact">
        <h2>{{ key + '.contact.title' | transloco }}</h2>
        <p>
          @if (session.contactEmail(); as email) {
            {{ key + '.contact.body' | transloco: { email } }}
          } @else {
            {{ key + '.contact.none' | transloco }}
          }
        </p>
      </section>
    </article>
  `,
  styles: `
    :host {
      display: block;
      width: min(48rem, 100%);
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    h1 {
      margin-top: 0;
    }
    h2 {
      margin: 1.5rem 0 0.5rem;
      font-size: 1.15rem;
    }
    p {
      line-height: 1.6;
    }
  `,
})
export class LegalPage {
  /** Set by the route data. */
  readonly page = input.required<keyof typeof SECTIONS>();
  protected readonly session = inject(SessionStore);
  protected readonly sections = computed(() => SECTIONS[this.page()]);

  private readonly fragment = toSignal(inject(ActivatedRoute).fragment);
  private readonly translation = toSignal(inject(TranslocoService).selectTranslation());

  constructor() {
    // Links such as /privacy#deletion: the page scrolls inside <main>, not the window
    // (router anchor scrolling does not apply), once the texts are loaded.
    const document = inject(DOCUMENT);
    afterRenderEffect(() => {
      const id = this.fragment();
      if (id && this.translation()) {
        document.getElementById(id)?.scrollIntoView();
      }
    });
  }
}
