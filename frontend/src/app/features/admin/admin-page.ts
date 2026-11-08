import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContributionsAdmin } from './contributions-admin';
import { ImportsAdmin } from './imports-admin';
import { UsersAdmin } from './users-admin';

@Component({
  selector: 'app-admin-page',
  imports: [TranslocoPipe, ImportsAdmin, ContributionsAdmin, UsersAdmin],
  template: `
    <h1>{{ 'admin.title' | transloco }}</h1>
    <app-imports-admin />
    <app-contributions-admin />
    <app-users-admin />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      width: min(70rem, 100%);
      margin: 0 auto;
      padding: 1.5rem 1rem 3rem;
    }
    h1 {
      margin: 0;
    }
  `,
})
export class AdminPage {}
