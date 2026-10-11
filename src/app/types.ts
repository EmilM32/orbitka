import type { Dictionary, I18n } from '@ui/i18n.ts';

export type AppI18n = I18n<Dictionary>;

export type App = {
  dispose: () => void;
};
