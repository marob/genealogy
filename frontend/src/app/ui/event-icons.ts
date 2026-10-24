import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  iconBaptism,
  iconBirth,
  iconBurial,
  iconDeath,
  iconDivorce,
  iconEducation,
  iconEvent,
  iconOccupation,
  iconResidence,
  iconUnion,
} from './icons';

const EVENT_ICONS: Partial<Record<string, IconDefinition>> = {
  BIRT: iconBirth,
  CHR: iconBaptism,
  BAPM: iconBaptism,
  CONF: iconBaptism,
  FCOM: iconBaptism,
  DEAT: iconDeath,
  BURI: iconBurial,
  CREM: iconBurial,
  OCCU: iconOccupation,
  RESI: iconResidence,
  EDUC: iconEducation,
  GRAD: iconEducation,
  MARR: iconUnion,
  MARB: iconUnion,
  MARC: iconUnion,
  ENGA: iconUnion,
  DIV: iconDivorce,
  DIVF: iconDivorce,
  ANUL: iconDivorce,
};

/** Icône associée à un type d'événement GEDCOM. */
export function eventIcon(type: string): IconDefinition {
  return EVENT_ICONS[type] ?? iconEvent;
}
