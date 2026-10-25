import type { GenealogyDate } from './dates.ts';

/** REST API contract exposed by the backend under `/api`. */

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
  /** Marriage, divorce… (empty if the union is hidden). */
  events: EventDto[];
  /** true if the union details are hidden (less than 100 years old). */
  restricted: boolean;
}

export interface PersonDto {
  id: string;
  givenNames: string;
  surname: string;
  sex: Sex;
  fatherId?: string;
  motherId?: string;
  /** Families in which the person is one of the partners, sorted by date. */
  unions: UnionDto[];
  /**
   * true if the person was born less than 100 years ago and the user is not
   * allowed to see contemporaries: only the name and family links are then
   * provided.
   */
  restricted: boolean;
  /**
   * true if even the identity is hidden (strict privacy mode): no name and
   * an unknown sex, only the person's place in the tree.
   */
  hidden?: boolean;
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
  /** Personal root of the tree (otherwise the shared root). */
  rootPersonId?: string;
}

export interface AuthProviderDto {
  name: string;
  label: string;
}

export interface MeDto {
  user?: UserDto;
  /** Identity providers configured on the server. */
  providers: AuthProviderDto[];
  /** Development mode: everyone is an admin. */
  devBypass: boolean;
  /** Contact address of the site owner (privacy policy). */
  contactEmail?: string;
  /** What unauthorized users see of contemporaries: their names, or only their existence. */
  contemporaryPrivacy: 'names' | 'hidden';
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
  /** Encoding actually used to decode the file. */
  encoding: string;
  declaredCharset?: string;
  gedcomVersion?: string;
  sourceSoftware?: string;
  createdAt: string;
  committedAt?: string;
  stats: ImportStatsDto;
  warnings: string[];
  /** Currently applied import (the latest committed one). */
  current: boolean;
}

/** Search result: minimal information for the list. */
export interface PersonSummaryDto {
  id: string;
  givenNames: string;
  surname: string;
  sex: Sex;
  restricted: boolean;
  /** See `PersonDto.hidden`. */
  hidden?: boolean;
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
  /** Person shown by default: the personal root if any, otherwise the shared root. */
  rootPersonId?: string;
  /** Shared root, set by an administrator. */
  globalRootPersonId?: string;
  /** true if `rootPersonId` is the signed-in user's personal root. */
  personalRoot: boolean;
  persons: number;
}
