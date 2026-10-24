import type { GenealogyDate } from './dates.ts';

/** Contrat de l'API REST exposée par le backend sous `/api`. */

export type Sex = 'M' | 'F' | 'U';

export interface PlaceDto {
  id: number;
  name: string;
  locality?: string;
  postalCode?: string;
  county?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface EventDto {
  type: string;
  date?: GenealogyDate;
  place?: PlaceDto;
  value?: string;
}

export interface UnionDto {
  familyId: string;
  partnerId?: string;
  childIds: string[];
  /** Mariage, divorce… (vide si l'union est masquée). */
  events: EventDto[];
  /** true si le détail de l'union est masqué (moins de 100 ans). */
  restricted: boolean;
}

export interface PersonDto {
  id: string;
  givenNames: string;
  surname: string;
  sex: Sex;
  fatherId?: string;
  motherId?: string;
  /** Familles dont la personne est l'un des partenaires, triées par date. */
  unions: UnionDto[];
  /**
   * true si la personne est née il y a moins de 100 ans et que l'utilisateur
   * n'a pas le droit de voir les contemporains : seuls le nom et les liens
   * familiaux sont alors fournis.
   */
  restricted: boolean;
  events: EventDto[];
  occupation?: string;
  note?: string;
}

export type Role = 'ADMIN' | 'MEMBER';

export interface UserDto {
  id: number;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  role: Role;
  canSeeContemporary: boolean;
  createdAt: string;
  lastLoginAt?: string;
  /** Racine personnelle de l'arbre (sinon la racine commune). */
  rootPersonId?: string;
}

export interface AuthProviderDto {
  name: string;
  label: string;
}

export interface MeDto {
  user?: UserDto;
  /** Fournisseurs d'identité configurés côté serveur. */
  providers: AuthProviderDto[];
  /** Mode développement : tout le monde est admin. */
  devBypass: boolean;
}

export type ImportStatus = 'preview' | 'committed';

export interface ImportStatsDto {
  persons: number;
  families: number;
  events: number;
  places: number;
  datedPersons: number;
  ignoredTags: Record<string, number>;
}

export interface ImportDto {
  id: number;
  status: ImportStatus;
  fileName: string;
  /** Encodage réellement utilisé pour décoder le fichier. */
  encoding: string;
  declaredCharset?: string;
  gedcomVersion?: string;
  sourceSoftware?: string;
  createdAt: string;
  committedAt?: string;
  stats: ImportStatsDto;
  warnings: string[];
  /** Import actuellement appliqué (le dernier validé). */
  current: boolean;
}

/** Résultat de recherche : informations minimales pour la liste. */
export interface PersonSummaryDto {
  id: string;
  givenNames: string;
  surname: string;
  sex: Sex;
  restricted: boolean;
  birth?: EventDto;
  death?: EventDto;
}

export interface SearchResultDto {
  items: PersonSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SurnameDto {
  surname: string;
  count: number;
}

export interface TreeInfoDto {
  /** Personne affichée par défaut : racine personnelle si elle existe, sinon racine commune. */
  rootPersonId?: string;
  /** Racine commune, définie par un administrateur. */
  globalRootPersonId?: string;
  /** true si `rootPersonId` est la racine personnelle de l'utilisateur connecté. */
  personalRoot: boolean;
  persons: number;
}
