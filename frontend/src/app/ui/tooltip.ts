import {
  Component,
  Directive,
  ElementRef,
  inject,
  Injector,
  input,
  type OnDestroy,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import {
  type ConnectedPosition,
  createFlexibleConnectedPositionStrategy,
  createOverlayRef,
  createRepositionScrollStrategy,
  type OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal, TemplatePortal } from '@angular/cdk/portal';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

const POSITIONS: Record<TooltipPosition, ConnectedPosition[]> = {
  top: [
    { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -6 },
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 6 },
  ],
  bottom: [
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 6 },
    { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -6 },
  ],
  left: [
    { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -6 },
    { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 6 },
  ],
  right: [
    { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 6 },
    { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -6 },
  ],
};

@Component({
  selector: 'app-tooltip-text',
  template: '{{ text }}',
  host: { class: 'tooltip', role: 'tooltip' },
})
class TooltipText {
  text = '';
}

/**
 * Lightweight tooltip (text or template) based on the CDK overlay.
 * Shown on hover and on keyboard focus.
 */
@Directive({
  selector: '[appTooltip]',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'scheduleHide()',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
    '(keydown.escape)': 'hide()',
  },
})
export class Tooltip implements OnDestroy {
  readonly appTooltip = input.required<string | TemplateRef<unknown> | null | undefined>();
  readonly tooltipPosition = input<TooltipPosition>('top');

  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly viewContainer = inject(ViewContainerRef);
  private overlayRef?: OverlayRef;
  private hideTimer?: ReturnType<typeof setTimeout>;

  show(): void {
    clearTimeout(this.hideTimer);
    const content = this.appTooltip();
    if (!content || this.overlayRef?.hasAttached()) {
      return;
    }
    this.overlayRef ??= createOverlayRef(this.injector, {
      positionStrategy: createFlexibleConnectedPositionStrategy(this.injector, this.element).withPositions(
        POSITIONS[this.tooltipPosition()],
      ),
      scrollStrategy: createRepositionScrollStrategy(this.injector),
      panelClass: 'tooltip-panel',
    });
    if (content instanceof TemplateRef) {
      this.overlayRef.attach(new TemplatePortal(content, this.viewContainer));
    } else {
      this.overlayRef.attach(new ComponentPortal(TooltipText)).instance.text = content;
    }
    // Keep the tooltip open while hovering it (rich content).
    const pane = this.overlayRef.overlayElement;
    pane.onmouseenter = () => clearTimeout(this.hideTimer);
    pane.onmouseleave = () => this.scheduleHide();
  }

  scheduleHide(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), 150);
  }

  hide(): void {
    clearTimeout(this.hideTimer);
    this.overlayRef?.detach();
  }

  ngOnDestroy(): void {
    clearTimeout(this.hideTimer);
    this.overlayRef?.dispose();
  }
}
