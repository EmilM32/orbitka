import './sceneUnavailable.css';

import { type Dictionary, type I18n } from './i18n.ts';
import { createIcon } from './icons.ts';

type AppI18n = I18n<Dictionary>;

/** 'unsupported': no WebGL at start. 'lost': the GPU context was lost later. */
export type SceneUnavailableReason = 'unsupported' | 'lost';

// A full-screen notice in place of the scene. It is an alert, not a dialog:
// there is nothing behind it to return to, so there is no focus trap.
export function showSceneUnavailable(
  parent: HTMLElement,
  i18n: AppI18n,
  reason: SceneUnavailableReason,
): HTMLElement {
  parent.querySelector('#scene-unavailable')?.remove();

  const notice = document.createElement('section');
  notice.id = 'scene-unavailable';
  notice.className = 'scene-unavailable';
  notice.setAttribute('role', 'alert');
  notice.setAttribute('aria-labelledby', 'scene-unavailable-title');
  notice.dataset.reason = reason;

  const brand = document.createElement('p');
  brand.className = 'scene-unavailable-brand';
  brand.setAttribute('aria-hidden', 'true');
  const brandName = document.createElement('span');
  brandName.textContent = i18n.t('app.brand');
  brand.append(createIcon('orbit'), brandName);

  const title = document.createElement('h1');
  title.id = 'scene-unavailable-title';
  title.textContent = i18n.t(`sceneUnavailable.${reason}.title`);

  const body = document.createElement('p');
  body.className = 'scene-unavailable-body';
  body.textContent = i18n.t(`sceneUnavailable.${reason}.body`);

  notice.append(brand, title, body);

  if (reason === 'lost') {
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'o-btn o-btn--primary';
    reload.textContent = i18n.t('sceneUnavailable.reload');
    reload.addEventListener('click', () => {
      window.location.reload();
    });
    notice.append(reload);
  }

  parent.append(notice);
  return notice;
}
