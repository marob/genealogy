import { faMars, faVenus, faVenusMars } from '@fortawesome/free-solid-svg-icons';

/** Font Awesome icons used in the application (explicit imports for tree-shaking). */
export {
  faAnglesDown as iconExpandDescendants,
  faAnglesUp as iconExpandAncestors,
  faPrint as iconPrint,
  faArrowRightFromBracket as iconLogout,
  faBaby as iconBirth,
  faCalendar as iconDate,
  faCaretDown as iconCaretDown,
  faCaretUp as iconCaretUp,
  faCheck as iconCheck,
  faChevronLeft as iconPrevious,
  faChevronRight as iconNext,
  faChurch as iconBaptism,
  faCross as iconDeath,
  faCrosshairs as iconFocus,
  faFile as iconFile,
  faFileImport as iconImport,
  faFilePdf as iconPdf,
  faFileZipper as iconArchive,
  faGear as iconSettings,
  faGraduationCap as iconEducation,
  faHeartCrack as iconDivorce,
  faHouseChimney as iconResidence,
  faLandmark as iconBurial,
  faNoteSticky as iconNote,
  faPaperclip as iconDocuments,
  faPeopleRoof as iconFamily,
  faStar as iconEvent,
  faHouse as iconRoot,
  faLocationDot as iconPlace,
  faMagnifyingGlass as iconSearch,
  faMinus as iconZoomOut,
  faPlus as iconZoomIn,
  faRing as iconUnion,
  faRotateLeft as iconReset,
  faTrash as iconDelete,
  faUpRightFromSquare as iconExternal,
  faUserTie as iconOccupation,
  faXmark as iconClose,
} from '@fortawesome/free-solid-svg-icons';

const SEX_ICONS: Record<string, typeof faMars> = { M: faMars, F: faVenus };

/** Icon for a person's sex (M, F, or unknown). */
export function sexIcon(sex: string) {
  return SEX_ICONS[sex] ?? faVenusMars;
}
