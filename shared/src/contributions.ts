import type { Sex } from './api.ts';

/**
 * Contributions: changes proposed by signed-in members, reviewed by an
 * administrator, then exported as a GEDCOM file to be merged into the
 * genealogy software, which stays the source of truth. Their author sees them
 * in the tree until they are integrated (PersonDto.proposal); other users only
 * see the genealogy data. Proposed persons have the id "W<contribution id>",
 * unions proposed with them "WF<contribution id>"; both can themselves be the
 * subject of further proposals (e.g. the father of a proposed father, a child
 * of a proposed couple).
 *
 * Routes (under /api):
 * - POST   /contributions                 propose changes (JSON: NewContributionDto); returns the
 *                                         contributions created (several for parents, a union…)
 * - POST   /contributions/media           propose a document (multipart: file, personId, title?, comment?)
 * - GET    /contributions/mine            the current user's contributions
 * - DELETE /contributions/:id             withdraw one's own pending contribution, with one's pending
 *                                         contributions about the person or union it proposed
 * - GET    /admin/contributions           all contributions (?status=pending…)
 * - PATCH  /admin/contributions/:id       review: { status: 'approved' | 'rejected', fields? }
 * - POST   /admin/contributions/export    zip (GEDCOM + documents) of the approved contributions,
 *                                         which become "exported"
 * - GET    /admin/contributions/:id/media the proposed document
 */

export type ContributionKind = 'edit' | 'add-person' | 'add-media' | 'edit-union';

/**
 * pending → approved | rejected; approved → exported (GEDCOM export);
 * exported → integrated (found in a later import of the genealogy software).
 */
export type ContributionStatus = 'pending' | 'approved' | 'rejected' | 'exported' | 'integrated';

/** Relation of a proposed person to the person the contribution starts from. */
export type Relation = 'child' | 'parent' | 'spouse';

/**
 * Person fields that can be proposed. Dates are free text, in French or
 * GEDCOM form: "12/03/1850", "03/1850", "1850", "vers 1850", "avant 1850",
 * "après 1850", "entre 1850 et 1855", "12 MAR 1850", "ABT 1850"…
 */
export interface PersonFieldsDto {
  givenNames?: string;
  surname?: string;
  sex?: Sex;
  occupation?: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
}

/** Union fields that can be proposed (dates as in PersonFieldsDto). */
export interface UnionFieldsDto {
  marriageDate?: string;
  marriagePlace?: string;
}

/** Fields of a contribution: a person's (edit, add-person) or a union's (edit-union). */
export type ContributionFieldsDto = PersonFieldsDto & UnionFieldsDto;

export type NewContributionDto =
  | {
      kind: 'edit';
      personId: string;
      /** Changed fields only. */
      fields: PersonFieldsDto;
      comment?: string;
    }
  | {
      kind: 'add-person';
      /** Existing person the new one is related to. */
      personId: string;
      relation: Relation;
      /**
       * Child: the union (family id) of `personId` it belongs to, i.e. its
       * other parent; without it, the other parent is unknown.
       * Parent: the parents' family it completes (found when omitted).
       * Spouse: a union of `personId` without a second partner it joins (the
       * other parent of its children); without it, a new union.
       */
      familyId?: string;
      /** givenNames or surname is required (the other one may be unknown). */
      fields: PersonFieldsDto;
      /** Spouse: details of the union. */
      union?: UnionFieldsDto;
      comment?: string;
    }
  | {
      /** One or both parents of a person, with their union. */
      kind: 'add-parents';
      personId: string;
      father?: PersonFieldsDto;
      mother?: PersonFieldsDto;
      union?: UnionFieldsDto;
      comment?: string;
    }
  | {
      kind: 'edit-union';
      /** One of the partners. */
      personId: string;
      /** A union of `personId`, from the genealogy or proposed ("WF…"). */
      familyId: string;
      /** Changed fields only. */
      fields: UnionFieldsDto;
      comment?: string;
    };

export interface ContributionDto {
  id: number;
  kind: ContributionKind;
  status: ContributionStatus;
  personId: string;
  /** Name of `personId` when the contribution was made. */
  person: { givenNames: string; surname: string };
  relation?: Relation;
  familyId?: string;
  /** Other partner of that union (new child, union edit), if known. */
  partner?: { givenNames: string; surname: string };
  /** Proposed values (edit, edit-union: changed fields; add-person: the new person). */
  fields: ContributionFieldsDto;
  /** Values of the changed fields when the contribution was made (edit, edit-union). */
  previous?: ContributionFieldsDto;
  comment?: string;
  /** Proposed document (add-media); no longer available once rejected (the file is deleted). */
  media?: { fileName: string; mimeType: string; title?: string; available: boolean };
  author?: { id: number; name: string };
  createdAt: string;
  reviewedAt?: string;
  exportedAt?: string;
  integratedAt?: string;
}
