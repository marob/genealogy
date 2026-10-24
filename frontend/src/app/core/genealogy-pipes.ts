import { Pipe, type PipeTransform } from '@angular/core';
import type { GenealogyDate, PlaceDto } from '@genealogie/shared';
import { formatGenealogyDate, formatPlace } from './genealogy-format';

/** `{{ event.date | genealogyDate: lang() }}` */
@Pipe({ name: 'genealogyDate' })
export class GenealogyDatePipe implements PipeTransform {
  transform(date: GenealogyDate | undefined, lang: string): string {
    return formatGenealogyDate(date, lang);
  }
}

@Pipe({ name: 'place' })
export class PlacePipe implements PipeTransform {
  transform(place: PlaceDto | undefined): string {
    return formatPlace(place);
  }
}
