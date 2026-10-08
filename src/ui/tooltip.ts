import './tooltip.css';

/** SPEC §5.3: a hover opens the tooltip after 300 ms, focus opens it at once. */
export const TOOLTIP_HOVER_DELAY_MS = 300;

export type TooltipPlacement = 'right' | 'top' | 'bottom';

/** Plain text, or nodes when part of it is bold (no innerHTML). */
export type TooltipContent = string | Node;

export type Tooltip = {
  readonly element: HTMLElement;
  setText(text: TooltipContent): void;
  dispose(): void;
};

export type TooltipOptions = {
  /** Fixed id, e.g. `tip-au`; otherwise `tip-<n>`. */
  id?: string;
  /**
   * Whether the trigger gets `aria-describedby`. Off when the trigger's own
   * label already says the same (the rail dots, SPEC §5.4).
   */
  describe?: boolean;
};

// Space between the trigger and the tooltip, and to the window edge.
const GAP_PX = 8;
const EDGE_PX = 8;

let nextId = 1;

export function createTooltip(
  trigger: HTMLElement,
  text: TooltipContent,
  placement: TooltipPlacement,
  options: TooltipOptions = {},
): Tooltip {
  const element = document.createElement('div');
  element.className = 'o-tooltip';
  element.id = options.id ?? `tip-${nextId++}`;
  element.setAttribute('role', 'tooltip');
  element.setAttribute('data-placement', placement);
  element.hidden = true;
  setText(text);
  document.body.append(element);

  const describe = options.describe ?? true;
  if (describe) {
    addToken(trigger, 'aria-describedby', element.id);
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  trigger.addEventListener('pointerenter', onPointerEnter);
  trigger.addEventListener('pointerleave', onPointerLeave);
  trigger.addEventListener('pointerdown', onPointerDown);
  trigger.addEventListener('focus', onFocus);
  trigger.addEventListener('blur', close);
  trigger.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', onDocumentPointerDown, true);

  return { element, setText, dispose };

  function setText(next: TooltipContent): void {
    if (typeof next === 'string') {
      element.textContent = next;
      return;
    }
    element.replaceChildren(next);
  }

  function open(): void {
    cancelTimer();
    if (disposed || !element.hidden) {
      return;
    }
    element.hidden = false;
    position();
  }

  function close(): void {
    cancelTimer();
    element.hidden = true;
  }

  function cancelTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function onPointerEnter(event: PointerEvent): void {
    if (event.pointerType === 'touch' || !element.hidden) {
      return;
    }
    cancelTimer();
    timer = setTimeout(open, TOOLTIP_HOVER_DELAY_MS);
  }

  function onPointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      return;
    }
    close();
  }

  // A tap opens it; the click on the trigger still goes through.
  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      open();
    }
  }

  function onFocus(): void {
    open();
  }

  // Esc closes only the tooltip: the canvas and the list do not see it.
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || element.hidden) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    if (element.hidden) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && trigger.contains(target)) {
      return;
    }
    close();
  }

  // Next to the trigger, moved back inside the window when it would leave it.
  function position(): void {
    const anchor = trigger.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    let left: number;
    let top: number;
    if (placement === 'right') {
      left = anchor.right + GAP_PX;
      top = anchor.top + (anchor.height - box.height) / 2;
    } else {
      left = anchor.left + (anchor.width - box.width) / 2;
      top =
        placement === 'top'
          ? anchor.top - GAP_PX - box.height
          : anchor.bottom + GAP_PX;
    }
    const maxLeft = window.innerWidth - EDGE_PX - box.width;
    const maxTop = window.innerHeight - EDGE_PX - box.height;
    element.style.left = `${Math.round(clamp(left, EDGE_PX, maxLeft))}px`;
    element.style.top = `${Math.round(clamp(top, EDGE_PX, maxTop))}px`;
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    cancelTimer();
    trigger.removeEventListener('pointerenter', onPointerEnter);
    trigger.removeEventListener('pointerleave', onPointerLeave);
    trigger.removeEventListener('pointerdown', onPointerDown);
    trigger.removeEventListener('focus', onFocus);
    trigger.removeEventListener('blur', close);
    trigger.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    if (describe) {
      removeToken(trigger, 'aria-describedby', element.id);
    }
    element.remove();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

function addToken(element: Element, name: string, token: string): void {
  const tokens = (element.getAttribute(name) ?? '')
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.includes(token)) {
    tokens.push(token);
  }
  element.setAttribute(name, tokens.join(' '));
}

function removeToken(element: Element, name: string, token: string): void {
  const tokens = (element.getAttribute(name) ?? '')
    .split(/\s+/)
    .filter((entry) => entry !== '' && entry !== token);
  if (tokens.length === 0) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, tokens.join(' '));
}
