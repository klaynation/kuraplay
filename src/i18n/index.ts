// i18n — natural-key localization for KuraPlay.
// ---------------------------------------------------------------------------
// Keys ARE the English source strings, so:
//   * untranslated entries fall back to perfect English automatically;
//   * community packs are plain { "English string": "translation" } JSON;
//   * there is no key registry to drift out of sync with the UI.
// Variables use {name} placeholders: t("{shown} of {total}", { shown: 1, total: 8 }).

import de from "./de.json";
import es from "./es.json";
import fr from "./fr.json";
import ja from "./ja.json";
import ptBR from "./pt-BR.json";

export interface LanguageOption {
  id: string;
  label: string;
}

type Dict = Record<string, string>;

const BUILTIN: { id: string; label: string; dict: Dict }[] = [
  { id: "en", label: "English", dict: {} },
  { id: "es", label: "Español", dict: es },
  { id: "fr", label: "Français", dict: fr },
  { id: "de", label: "Deutsch", dict: de },
  { id: "pt-BR", label: "Português (Brasil)", dict: ptBR },
  { id: "ja", label: "日本語", dict: ja },
];

const packs: { id: string; label: string; dict: Dict }[] = [];

let current = "en";

function activeDict(): Dict {
  const all = [...BUILTIN, ...packs];
  return all.find((l) => l.id === current)?.dict ?? {};
}

export function getLanguage(): string {
  return current;
}

export function setLanguage(id: string): void {
  const all = [...BUILTIN, ...packs];
  current = all.some((l) => l.id === id) ? id : "en";
}

export function languageOptions(): LanguageOption[] {
  return [...BUILTIN, ...packs].map((l) => ({ id: l.id, label: l.label }));
}

/** User packs: JSON files dropped into <app-data>/langs/, keyed by filename. */
export function registerPack(id: string, label: string, dict: Dict): void {
  const existing = packs.findIndex((p) => p.id === id);
  const entry = { id, label, dict };
  if (existing >= 0) packs[existing] = entry;
  else packs.push(entry);
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let out = activeDict()[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      out = out.split(`{${name}}`).join(String(value));
    }
  }
  return out;
}
