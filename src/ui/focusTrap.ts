export type FocusTrap = {
  activate(initial: HTMLElement): void;
  deactivate(): void;
  dispose(): void;
};

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

function isFocusable(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || element.closest('[hidden], [inert]') !== null) {
    return false;
  }
  return !(
    (element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) &&
    element.disabled
  );
}

// Keeps Tab and Shift+Tab inside the container: past the last element focus
// goes to the first one and back. The modal dialog makes the rest of the page
// inert, so focus cannot leave by other means. A container without focusable
// elements takes the focus itself (tabindex="-1").
export function createFocusTrap(container: HTMLElement): FocusTrap {
  let active = false;
  let disposed = false;
  let addedTabIndex = false;

  function focusables(): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      isFocusable,
    );
  }

  function focusContainer(): void {
    if (!container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
      addedTabIndex = true;
    }
    container.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!active || event.key !== 'Tab') {
      return;
    }

    const list = focusables();
    const first = list[0];
    const last = list.at(-1);
    if (first === undefined || last === undefined) {
      event.preventDefault();
      focusContainer();
      return;
    }

    const current = document.activeElement;
    if (event.shiftKey) {
      if (current === first || current === container) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (current === last || current === container) {
      event.preventDefault();
      first.focus();
    }
  }

  function deactivate(): void {
    if (!active) {
      return;
    }
    active = false;
    container.removeEventListener('keydown', onKeyDown);
    if (addedTabIndex) {
      container.removeAttribute('tabindex');
      addedTabIndex = false;
    }
  }

  return {
    activate(initial: HTMLElement) {
      if (disposed) {
        return;
      }
      if (!active) {
        active = true;
        container.addEventListener('keydown', onKeyDown);
      }
      if (container.contains(initial) && isFocusable(initial)) {
        initial.focus();
      }
      if (!container.contains(document.activeElement)) {
        const first = focusables()[0];
        if (first === undefined) {
          focusContainer();
        } else {
          first.focus();
        }
      }
    },
    deactivate,
    dispose() {
      if (disposed) {
        return;
      }
      deactivate();
      disposed = true;
    },
  };
}
