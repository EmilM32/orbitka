// `typeof import` of JSON is the message object, or a module namespace with `default`.
type PolishModule = typeof import('@content/locales/pl.json');

export type Dictionary = PolishModule extends { default: infer Messages }
  ? Messages
  : PolishModule;

export type PluralForms = {
  readonly one: string;
  readonly few: string;
  readonly many: string;
  readonly other: string;
};

type MessageEntry = string | Partial<PluralForms>;

type DictionaryInput = Readonly<Record<string, MessageEntry>>;

export type MessageParams = Readonly<Record<string, string | number>>;

type StringKeys<D> = Extract<keyof D, string>;

type MessageKeys<D> = {
  [K in StringKeys<D>]: D[K] extends string ? K : never;
}[StringKeys<D>];

type PluralKeys<D> = {
  [K in StringKeys<D>]: D[K] extends string ? never : K;
}[StringKeys<D>];

export type MessageKey = MessageKeys<Dictionary>;
export type PluralKey = PluralKeys<Dictionary>;

// A finished literal must be a known key, so a typo fails typecheck.
// A wide string, or a template with a hole, is checked when the function runs.
type ClosedLiteral<T extends string> = T extends ''
  ? true
  : T extends `${infer Head}${infer Tail}`
    ? string extends Head
      ? false
      : string extends Tail
        ? false
        : ClosedLiteral<Tail>
    : true;

type KeyArg<Allowed extends string, Key extends string> = string extends Key
  ? Key
  : ClosedLiteral<Key> extends true
    ? Key extends Allowed
      ? Key
      : Allowed
    : Key;

export type I18n<D extends DictionaryInput> = {
  t<Key extends string>(
    key: KeyArg<MessageKeys<D> & string, Key>,
    params?: MessageParams,
  ): string;
  plural<Key extends string>(
    key: KeyArg<PluralKeys<D> & string, Key>,
    count: number,
    params?: MessageParams,
  ): string;
  formatNumber(value: number, maximumFractionDigits?: number): string;
};

const PLACEHOLDER = /^[A-Za-z_][A-Za-z0-9_]*$/u;

function missingKey(key: string): Error {
  return new Error(`i18n: missing key "${key}"`);
}

function fill(
  key: string,
  template: string,
  params: MessageParams | undefined,
): string {
  const parts: string[] = [];
  let index = 0;

  while (index < template.length) {
    const open = template.indexOf('{', index);
    if (open === -1) {
      parts.push(template.slice(index));
      break;
    }

    parts.push(template.slice(index, open));
    const close = template.indexOf('}', open + 1);
    const name = close === -1 ? '' : template.slice(open + 1, close);
    if (close === -1 || !PLACEHOLDER.test(name)) {
      parts.push('{');
      index = open + 1;
      continue;
    }

    if (
      params === undefined ||
      !Object.hasOwn(params, name) ||
      params[name] === undefined
    ) {
      throw new Error(`i18n: key "${key}" is missing placeholder "{${name}}"`);
    }

    parts.push(String(params[name]));
    index = close + 1;
  }

  return parts.join('');
}

// `=== 0` is true for -0, which drops the minus from a rounded zero.
function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

export function createI18n<const D extends DictionaryInput>(
  dictionary: D,
  locale: string,
): I18n<D> {
  const messages: DictionaryInput = dictionary;
  const pluralRules = new Intl.PluralRules(locale);
  const formatters = new Map<number, Intl.NumberFormat>();

  function formatterFor(maximumFractionDigits: number): Intl.NumberFormat {
    const cached = formatters.get(maximumFractionDigits);
    if (cached !== undefined) {
      return cached;
    }

    const created = new Intl.NumberFormat(locale, { maximumFractionDigits });
    formatters.set(maximumFractionDigits, created);
    return created;
  }

  formatterFor(1);

  function formatNumber(value: number, maximumFractionDigits = 1): string {
    if (!Number.isFinite(value)) {
      throw new RangeError(
        `formatNumber: parameter "value" must be finite, got ${value}`,
      );
    }

    const format = formatterFor(maximumFractionDigits);
    return format.format(roundTo(value, maximumFractionDigits));
  }

  function textMessage(key: string): string {
    if (!Object.hasOwn(messages, key)) {
      throw missingKey(key);
    }

    const value = messages[key];
    if (typeof value !== 'string') {
      throw new Error(`i18n: key "${key}" is a plural message, use plural()`);
    }

    return value;
  }

  function pluralMessage(key: string): Partial<PluralForms> {
    if (!Object.hasOwn(messages, key)) {
      throw missingKey(key);
    }

    const value = messages[key];
    if (value === undefined || typeof value === 'string') {
      throw new Error(`i18n: key "${key}" is a string message, use t()`);
    }

    return value;
  }

  function t<Key extends string>(
    key: KeyArg<MessageKeys<D> & string, Key>,
    params?: MessageParams,
  ): string {
    return fill(key, textMessage(key), params);
  }

  function plural<Key extends string>(
    key: KeyArg<PluralKeys<D> & string, Key>,
    count: number,
    params?: MessageParams,
  ): string {
    if (!Number.isFinite(count)) {
      throw new RangeError(
        `plural: parameter "count" must be finite, got ${count}`,
      );
    }

    const rounded = roundTo(count, 1);
    const category = pluralRules.select(Math.abs(rounded));
    const template = pluralMessage(key)[category as keyof PluralForms];
    if (typeof template !== 'string') {
      throw new Error(
        `i18n: key "${key}" is missing plural form "${category}"`,
      );
    }

    return fill(key, template, { ...params, count: formatNumber(rounded) });
  }

  return { t, plural, formatNumber };
}
