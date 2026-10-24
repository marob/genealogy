import type { Routes } from '@angular/router';
import { adminGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tree' },
  { path: 'tree', loadComponent: () => import('./features/tree/tree-page').then((m) => m.TreePage) },
  { path: 'tree/:id', loadComponent: () => import('./features/tree/tree-page').then((m) => m.TreePage) },
  { path: 'print', loadComponent: () => import('./features/print/print-page').then((m) => m.PrintPage) },
  { path: 'search', loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage) },
  { path: 'login', loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage) },
  {
    path: 'account',
    loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage),
  },
  {
    path: 'privacy',
    data: { page: 'privacy' },
    loadComponent: () => import('./features/legal/legal-page').then((m) => m.LegalPage),
  },
  {
    path: 'terms',
    data: { page: 'terms' },
    loadComponent: () => import('./features/legal/legal-page').then((m) => m.LegalPage),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-page').then((m) => m.AdminPage),
  },
  { path: '**', redirectTo: 'tree' },
];
