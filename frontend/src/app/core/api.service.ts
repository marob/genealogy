import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ImportDto,
  MeDto,
  PersonDto,
  Role,
  SearchResultDto,
  SurnameDto,
  TreeInfoDto,
  UserDto,
} from '@genealogie/shared';
import { firstValueFrom } from 'rxjs';

export type Relatives = 'parents' | 'children' | 'unions';

export interface SearchCriteria {
  q?: string;
  surname?: string;
  place?: string;
  bornFrom?: number;
  bornTo?: number;
  sex?: 'M' | 'F' | 'U';
  page?: number;
  pageSize?: number;
}

/**
 * Accès à l'API REST. Les personnes sont mises en cache : elles ne changent
 * qu'à l'import d'un nouveau fichier ou à un changement d'utilisateur, deux
 * situations qui appellent `clearCache()`.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Promise<PersonDto | undefined>>();
  private readonly lineages = new Map<string, Promise<PersonDto[]>>();

  clearCache(): void {
    this.cache.clear();
    this.lineages.clear();
  }

  me(): Promise<MeDto> {
    return firstValueFrom(this.http.get<MeDto>('/api/me'));
  }

  logout(): Promise<void> {
    return firstValueFrom(this.http.post<void>('/api/auth/logout', null));
  }

  treeInfo(): Promise<TreeInfoDto> {
    return firstValueFrom(this.http.get<TreeInfoDto>('/api/tree'));
  }

  /** Charge une personne et ses proches ; les proches alimentent le cache. */
  person(id: string, relatives: Relatives[] = []): Promise<PersonDto | undefined> {
    const cached = this.cache.get(id);
    if (cached && relatives.length === 0) {
      return cached;
    }
    const params = relatives.length ? new HttpParams().set('include', relatives.join(',')) : undefined;
    const request = firstValueFrom(
      this.http.get<PersonDto[]>(`/api/persons/${encodeURIComponent(id)}`, params ? { params } : {}),
    );
    const person = request.then((people) => {
      for (const relative of people.slice(1)) {
        this.cache.set(relative.id, Promise.resolve(relative));
      }
      return people[0];
    });
    this.cache.set(id, person);
    person.catch(() => this.cache.delete(id));
    return person;
  }

  /** Charge plusieurs personnes en une requête pour celles absentes du cache. */
  async people(ids: (string | undefined)[]): Promise<PersonDto[]> {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))];
    const missing = wanted.filter((id) => !this.cache.has(id));
    if (missing.length) {
      const request = firstValueFrom(
        this.http.get<PersonDto[]>('/api/persons', { params: { ids: missing.join(',') } }),
      );
      for (const id of missing) {
        const person = request.then((people) => people.find((p) => p.id === id));
        this.cache.set(id, person);
        person.catch(() => this.cache.delete(id));
      }
    }
    const people = await Promise.all(wanted.map((id) => this.cache.get(id)!));
    return people.filter((person): person is PersonDto => !!person);
  }

  /** Ascendants, descendants et conjoints d'une personne ; tous alimentent le cache. */
  lineage(id: string, generations: { ancestors: number; descendants: number }): Promise<PersonDto[]> {
    const key = `${id}/${generations.ancestors}/${generations.descendants}`;
    let lineage = this.lineages.get(key);
    if (!lineage) {
      lineage = this.fetchLineage(id, generations);
      lineage.catch(() => this.lineages.delete(key));
      this.lineages.set(key, lineage);
    }
    return lineage;
  }

  private async fetchLineage(
    id: string,
    generations: { ancestors: number; descendants: number },
  ): Promise<PersonDto[]> {
    const people = await firstValueFrom(
      this.http.get<PersonDto[]>(`/api/persons/${encodeURIComponent(id)}/lineage`, {
        params: { ancestors: generations.ancestors, descendants: generations.descendants },
      }),
    );
    for (const person of people) {
      this.cache.set(person.id, Promise.resolve(person));
    }
    return people;
  }

  search(criteria: SearchCriteria): Promise<SearchResultDto> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(criteria)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return firstValueFrom(this.http.get<SearchResultDto>('/api/persons/search', { params }));
  }

  surnames(): Promise<SurnameDto[]> {
    return firstValueFrom(this.http.get<SurnameDto[]>('/api/surnames'));
  }

  // Administration

  users(): Promise<UserDto[]> {
    return firstValueFrom(this.http.get<UserDto[]>('/api/admin/users'));
  }

  updateUser(id: number, changes: { role?: Role; canSeeContemporary?: boolean }): Promise<UserDto> {
    return firstValueFrom(this.http.patch<UserDto>(`/api/admin/users/${id}`, changes));
  }

  deleteUser(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/users/${id}`));
  }

  imports(): Promise<ImportDto[]> {
    return firstValueFrom(this.http.get<ImportDto[]>('/api/admin/imports'));
  }

  uploadGedcom(file: File): Promise<ImportDto> {
    const body = new FormData();
    body.append('file', file, file.name);
    return firstValueFrom(this.http.post<ImportDto>('/api/admin/imports', body));
  }

  async commitImport(id: number): Promise<ImportDto> {
    const result = await firstValueFrom(this.http.post<ImportDto>(`/api/admin/imports/${id}/commit`, null));
    this.clearCache();
    return result;
  }

  deleteImport(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/imports/${id}`));
  }

  /** Racine personnelle de l'utilisateur connecté ; `null` pour revenir à la racine commune. */
  setMyRoot(personId: string | null): Promise<TreeInfoDto> {
    return firstValueFrom(this.http.put<TreeInfoDto>('/api/me/root', { personId }));
  }

  setRootPerson(personId: string): Promise<TreeInfoDto> {
    return firstValueFrom(this.http.put<TreeInfoDto>('/api/admin/tree/root', { personId }));
  }
}
