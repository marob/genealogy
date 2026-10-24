import { HttpErrorResponse } from '@angular/common/http';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('shows the error message returned by the API', () => {
    const service = new NotificationsService();
    service.error(new HttpErrorResponse({ status: 403, error: { message: 'Request origin not allowed.' } }));
    service.error(new HttpErrorResponse({ status: 400, error: { message: ['a: requis', 'b: invalide'] } }));
    service.error(new Error('network'));
    expect(service.items().map((item) => [item.message, item.params])).toEqual([
      ['common.errorWithDetail', { detail: 'Request origin not allowed.' }],
      ['common.errorWithDetail', { detail: 'a: requis ; b: invalide' }],
      ['common.error', undefined],
    ]);
  });
});
