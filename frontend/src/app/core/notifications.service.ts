import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';

export interface Notification {
  id: number;
  kind: 'success' | 'error' | 'info';
  /** Translation key. */
  message: string;
  params?: Record<string, unknown>;
}

/** Transient messages shown at the bottom of the screen. */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private nextId = 1;
  readonly items = signal<Notification[]>([]);

  show(kind: Notification['kind'], message: string, params?: Record<string, unknown>): void {
    const notification: Notification = { id: this.nextId++, kind, message, ...(params ? { params } : {}) };
    this.items.update((items) => [...items, notification]);
    setTimeout(() => this.dismiss(notification.id), kind === 'error' ? 8000 : 4000);
  }

  /** API error: shows the message returned by the server, if any. */
  error(error: unknown): void {
    const body: unknown = error instanceof HttpErrorResponse ? error.error : undefined;
    const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined;
    let detail: string | undefined;
    if (Array.isArray(message)) {
      detail = message.join(' ; ');
    } else if (typeof message === 'string') {
      detail = message;
    }
    if (detail) {
      this.show('error', 'common.errorWithDetail', { detail });
    } else {
      this.show('error', 'common.error');
    }
  }

  dismiss(id: number): void {
    this.items.update((items) => items.filter((item) => item.id !== id));
  }
}
