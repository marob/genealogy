import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { person } from '../../testing/test-helpers';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads a person with their relatives and caches the relatives', async () => {
    const promise = api.person('I1', ['parents', 'children']);
    http.expectOne('/api/persons/I1?include=parents,children').flush([person({ id: 'I1' }), person({ id: 'I0' })]);
    expect((await promise)?.id).toBe('I1');

    // The parent is already cached: no request.
    expect((await api.people(['I0']))[0]?.id).toBe('I0');
    http.expectNone('/api/persons?ids=I0');
  });

  it('requests only uncached people, in a single request', async () => {
    const first = api.people(['I1', undefined, 'I2', 'I1']);
    http.expectOne('/api/persons?ids=I1,I2').flush([person({ id: 'I2' }), person({ id: 'I1' })]);
    expect((await first).map((p) => p.id)).toEqual(['I1', 'I2']);

    const second = api.people(['I2', 'I3']);
    http.expectOne('/api/persons?ids=I3').flush([person({ id: 'I3' })]);
    expect((await second).map((p) => p.id)).toEqual(['I2', 'I3']);
  });

  it('clears the cache after an import is applied', async () => {
    const load = api.people(['I1']);
    http.expectOne('/api/persons?ids=I1').flush([person({ id: 'I1' })]);
    await load;

    const commit = api.commitImport(3);
    http.expectOne({ method: 'POST', url: '/api/admin/imports/3/commit' }).flush({ id: 3 });
    await commit;

    const reload = api.people(['I1']);
    http.expectOne('/api/persons?ids=I1').flush([person({ id: 'I1' })]);
    await reload;
  });

  it('sends only the filled-in search criteria', async () => {
    const promise = api.search({ q: 'martin', place: '', bornFrom: 1850, page: 1 });
    http
      .expectOne('/api/persons/search?q=martin&bornFrom=1850&page=1')
      .flush({ items: [], total: 0, page: 1, pageSize: 50 });
    await promise;
  });

  it('sends the GEDCOM file as multipart', async () => {
    const file = new File(['0 HEAD'], 'arbre.ged');
    const promise = api.uploadGedcom(file);
    const request = http.expectOne({ method: 'POST', url: '/api/admin/imports' });
    expect((request.request.body as FormData).get('file')).toBeInstanceOf(File);
    request.flush({ id: 1 });
    await promise;
  });
});
