import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';

export interface Notification {
  id: number;
  kind: 'success' | 'error' | 'info';
  /** Clé de traduction. */
  message: string;
  params?: Record<string, unknown>;
}

/** Messages éphémères affichés en bas de l'écran. */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private nextId = 1;
  readonly items = signal<Notification[]>([]);

  show(kind: Notification['kind'], message: string, params?: Record<string, unknown>): void {
    const notification: Notification = { id: this.nextId++, kind, message, ...(params ? { params } : {}) };
    this.items.update((items) => [...items, notification]);
    setTimeout(() => this.dismiss(notification.id), kind === 'error' ? 8000 : 4000);
  }

  /** Erreur d'API : affiche le message renvoyé par le serveur s'il existe. */
  error(error: unknown): void {
    const body: unknown = error instanceof HttpErrorResponse ? error.error : undefined;
    const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined;
    const detail = Array.isArray(message) ? message.join(' ; ') : typeof message === 'string' ? message : undefined;
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
