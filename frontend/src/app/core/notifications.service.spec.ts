import { HttpErrorResponse } from '@angular/common/http';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('affiche le message d’erreur renvoyé par l’API', () => {
    const service = new NotificationsService();
    service.error(new HttpErrorResponse({ status: 403, error: { message: 'Origine de la requête non autorisée.' } }));
    service.error(new HttpErrorResponse({ status: 400, error: { message: ['a: requis', 'b: invalide'] } }));
    service.error(new Error('réseau'));
    expect(service.items().map((item) => [item.message, item.params])).toEqual([
      ['common.errorWithDetail', { detail: 'Origine de la requête non autorisée.' }],
      ['common.errorWithDetail', { detail: 'a: requis ; b: invalide' }],
      ['common.error', undefined],
    ]);
  });
});
