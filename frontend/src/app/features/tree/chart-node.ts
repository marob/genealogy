import { Component, computed, inject, input } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { TranslocoPipe } from '@jsverse/transloco';
import { GenealogyDatePipe } from '../../core/genealogy-pipes';
import { LanguageService } from '../../core/language.service';
import { iconCaretDown, iconCaretUp, iconDate, iconPlace, iconUnion } from '../../ui/icons';
import { Tooltip } from '../../ui/tooltip';
import { PersonCard } from './person-card';
import { TreeController } from './tree-controller';
import type { TreeNode, TreePart } from './tree-node';

/**
 * Nœud de l'arbre, affiché récursivement sous forme de table : ancêtres
 * au-dessus, descendants en dessous, conjoints à droite de la racine.
 */
@Component({
  // Sélecteur d'attribut : le composant doit être une <table> pour la mise en page.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'table[appChartNode]',
  imports: [PersonCard, FaIconComponent, TranslocoPipe, Tooltip, GenealogyDatePipe],
  templateUrl: './chart-node.html',
  styleUrl: './chart-node.scss',
  host: { class: 'chart-table' },
})
export class ChartNode {
  readonly node = input.required<TreeNode>();
  readonly part = input.required<TreePart>();

  protected readonly tree = inject(TreeController);
  protected readonly lang = inject(LanguageService).current;

  protected readonly showParents = computed(() => this.part() !== 'children' && !!this.node().parents()?.length);
  protected readonly showChildren = computed(() => this.part() !== 'parents' && !!this.node().children()?.length);
  protected readonly canToggleParents = computed(() => this.part() !== 'children' && this.node().hasParents);
  protected readonly canToggleChildren = computed(() => this.part() !== 'parents' && this.node().childIds.length > 0);

  /** Trait vers les parents affichés, ou vers l'enfant dont on est l'ascendant. */
  protected readonly lineAbove = computed(() => this.showParents() || this.part() === 'children');
  protected readonly lineBelow = computed(() => this.showChildren() || this.part() === 'parents');

  /** Chaque personne occupe deux colonnes (traits gauche/droit). */
  protected readonly colspan = computed(() =>
    Math.max(
      this.showParents() ? this.node().parents()!.length * 2 : 0,
      this.showChildren() ? this.node().children()!.length * 2 : 0,
      1,
    ),
  );

  /** Union correspondant à un conjoint affiché à droite de la racine. */
  protected unionWith(partnerId: string) {
    return this.node().person.unions.find((union) => union.partnerId === partnerId);
  }

  protected readonly icons = { iconCaretDown, iconCaretUp, iconUnion, iconDate, iconPlace };
}
