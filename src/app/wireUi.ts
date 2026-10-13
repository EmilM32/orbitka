import type { BodyContentCatalog } from '@content/bodyContent.ts';
import { shouldShowRail } from '@core/bodiesRail.ts';
import { presetIdForSpeed } from '@core/clock.ts';
import type { AppStorage } from '@core/storage.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';
import { bodies } from '@data/bodies.ts';
import { TEXTURE_SOURCE } from '@render/textureStore.ts';
import { createBodiesDrawer, type BodiesDrawer } from '@ui/bodiesDrawer.ts';
import { createBodiesPanel } from '@ui/bodiesPanel.ts';
import {
  createBodyCard,
  type BodyCard,
  type BodyCardInterior,
} from '@ui/bodyCard.ts';
import { createLayerLabel } from '@ui/layerLabel.ts';
import { createPageHeader } from '@ui/pageHeader.ts';
import { createScaleNotice } from '@ui/scaleNotice.ts';
import { createGlobalShortcuts } from '@ui/globalShortcuts.ts';
import { createShortcutsDialog } from '@ui/shortcutsDialog.ts';
import { createTimeControls } from '@ui/timeControls.ts';
import { createViewControls } from '@ui/viewControls.ts';

import { collectSourceCitations } from './sourceCitations.ts';
import { createDisposables } from './disposables.ts';
import { buildViewLink, copyText } from './viewLink.ts';
import type { AppI18n } from './types.ts';
import type { SceneRig } from './wireScene.ts';
import type { SelectionRig } from './wireSelection.ts';
import type { TimeRig } from './wireTime.ts';
import type { ViewRig } from './wireView.ts';

export type UiInputs = {
  canvas: HTMLCanvasElement;
  i18n: AppI18n;
  storage: AppStorage | null;
  bodyContent: BodyContentCatalog;
  interiors: Readonly<Record<string, BodyCardInterior>>;
  initialCutaway: boolean;
  /** A link turned the gravity grid on. */
  initialGravity: boolean;
  viewRig: ViewRig;
  sceneRig: SceneRig;
  selectionRig: SelectionRig;
  timeRig: TimeRig;
};

/**
 * The DOM panels. The creation order is the Tab order: header, body list,
 * view controls, body card, time controls.
 */
export function wireUi({
  canvas,
  i18n,
  storage,
  bodyContent,
  interiors,
  initialCutaway,
  initialGravity,
  viewRig,
  sceneRig,
  selectionRig,
  timeRig,
}: UiInputs) {
  const { cameraController, reducedMotion } = viewRig;
  const { selection, selectable, viewInsets } = selectionRig;
  const stack = createDisposables();
  const pageHeader = createPageHeader(document.body, i18n, canvas);
  stack.add(() => {
    pageHeader.remove();
  });
  const citations = collectSourceCitations(bodyContent);
  const scaleNotice = createScaleNotice(pageHeader, i18n, {
    textures: TEXTURE_SOURCE,
    funFacts: citations.funFacts,
    cutaways: citations.cutaways,
  });
  stack.add(() => {
    scaleNotice.dispose();
  });
  let bodiesDrawer: BodiesDrawer | null = null;
  const bodyById = new Map(bodies.map((body) => [body.id, body]));
  const bodiesPanel = createBodiesPanel(document.body, {
    bodies: selectable.map((body) => {
      const def = bodyById.get(body.id);
      return {
        id: body.id,
        color: def?.visual.color ?? '#ffffff',
        axisAu:
          def?.type === 'planet' ? (def.orbit?.semiMajorAxisAu ?? null) : null,
      };
    }),
    selection,
    i18n,
    before: canvas,
    getFocusFallback: () => bodiesDrawer?.getFocusFallback() ?? null,
    onUserCollapsedChange: () => {
      updateListMode();
    },
  });
  stack.add(() => {
    bodiesPanel.dispose();
  });
  bodiesDrawer = createBodiesDrawer(document.body, {
    panel: bodiesPanel,
    selection,
    i18n,
    matchMedia: window.matchMedia.bind(window),
    before: canvas,
  });
  const drawer = bodiesDrawer;
  stack.add(() => {
    drawer.dispose();
  });
  // The list folds into the rail beside an open card up to 1440 px; the
  // tablet drawer has no rail (SPEC §5.4).
  const tabletListQuery = window.matchMedia(
    `(max-width: ${VIEW_CONFIG.tabletMaxWidthPx}px)`,
  );
  const railWidthQuery = window.matchMedia(
    `(max-width: ${VIEW_CONFIG.railMaxWidthPx}px)`,
  );
  const updateListMode = (): void => {
    const rail =
      !tabletListQuery.matches &&
      shouldShowRail({
        viewportWidthPx: window.innerWidth,
        hasSelection: selection.getSelectedId() !== null,
        userCollapsed: bodiesPanel.isUserCollapsed(),
      });
    bodiesPanel.setMode(rail ? 'rail' : 'list');
  };
  stack.add(
    selection.subscribe((event) => {
      if (event.kind !== 'hover') {
        updateListMode();
      }
    }),
  );
  tabletListQuery.addEventListener('change', updateListMode);
  railWidthQuery.addEventListener('change', updateListMode);
  stack.add(() => {
    tabletListQuery.removeEventListener('change', updateListMode);
    railWidthQuery.removeEventListener('change', updateListMode);
  });
  const { quality, orbitLines, gravityGrid, forceArrows, cutaway } = sceneRig;
  let bodyCard: BodyCard | null = null;
  const shortcutsDialog = createShortcutsDialog(document.body, i18n);
  stack.add(() => {
    shortcutsDialog.dispose();
  });
  const viewControls = createViewControls(document.body, {
    i18n,
    selection,
    storage,
    onZoom: (factor) => {
      cameraController.zoomBy(factor, false);
    },
    onOrbitsChange: (visible) => {
      orbitLines.setOrbitLinesVisible(visible);
    },
    onGravityChange: (visible) => {
      gravityGrid.setVisible(visible);
      scaleNotice.setGravity(visible);
    },
    onGravityArrowsChange: (visible) => {
      forceArrows.setVisible(visible);
      scaleNotice.setGravityArrows(visible);
    },
    gravityFromLink: initialGravity,
    onQualityChange: (level) => {
      quality.setOverride(level);
    },
    onShowShortcuts: () => {
      shortcutsDialog.open();
    },
    onCopyLink: () => {
      const { clock } = timeRig;
      const bodyId = selection.getSelectedId();
      const link = buildViewLink(window.location, {
        bodyId,
        days: clock.days,
        paused: clock.paused,
        presetId: presetIdForSpeed(clock.speed),
        cutaway: bodyId !== null && (bodyCard?.isCutawayOpen() ?? false),
        gravity: viewControls.isGravityVisible(),
      });
      return copyText(navigator.clipboard, link);
    },
    qualityValue: quality.getSource() === 'override' ? quality.get() : null,
    qualityLocked: quality.getSource() === 'param',
    before: canvas.nextSibling ?? undefined,
  });
  stack.add(() => {
    viewControls.dispose();
  });
  const tabletQuery = window.matchMedia(
    `(min-width: ${VIEW_CONFIG.tabletMinWidthPx}px) and (max-width: ${VIEW_CONFIG.tabletMaxWidthPx}px)`,
  );
  // After the canvas and before the view group in the Tab order (SPEC §8).
  const layerLabel = createLayerLabel(document.body);
  stack.add(() => {
    layerLabel.dispose();
  });
  const card = createBodyCard(document.body, {
    bodies,
    content: bodyContent,
    selection,
    insets: viewInsets,
    i18n,
    isTablet: () => tabletQuery.matches,
    before: viewControls.element,
    reducedMotion,
    focusOnClose: canvas,
    interiors,
    initialCutaway,
    onCutaway: (state) => {
      cutaway.setActive(state.active);
      cutaway.setBody(state.active ? state.bodyId : null);
      cutaway.setHighlight(state.layerId);
      const layers =
        state.bodyId === null ? undefined : interiors[state.bodyId]?.layers;
      layerLabel.setText(
        layers?.find((layer) => layer.id === state.layerId)?.name ?? null,
      );
    },
  });
  bodyCard = card;
  stack.add(() => {
    card.dispose();
  });
  const timeControls = createTimeControls(
    document.body,
    timeRig.clock,
    i18n,
    viewControls.element.nextSibling,
  );
  stack.add(() => {
    timeControls.dispose();
  });
  const shortcuts = createGlobalShortcuts({
    bodyIds: selection.ids,
    onTogglePause: () => {
      timeRig.clock.togglePause();
    },
    // Only through the selection (ADR-009): the flight and the card follow.
    onSelect: (id) => {
      selection.select(id);
    },
    onToday: () => {
      timeControls.goToToday();
    },
    onToggleFullscreen: () => {
      viewControls.toggleFullscreen();
    },
    onShowShortcuts: () => {
      shortcutsDialog.open();
    },
  });
  stack.add(shortcuts.dispose);

  return {
    pageHeader,
    bodiesPanel,
    bodiesDrawer: drawer,
    viewControls,
    bodyCard: card,
    layerLabel,
    timeControls,
    tabletQuery,
    dispose: stack.disposeAll,
  };
}

export type UiRig = ReturnType<typeof wireUi>;
