"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

// Tema claro/escuro (2026-09) — preferência persistida em profiles.theme_preference, aplicada via
// classe `.dark` em <html> (ver tailwind.config.js darkMode:'class' e as variáveis de cor em
// app/globals.css). O script inline em app/layout.js já aplica o valor cacheado em localStorage
// antes do primeiro paint (evita flash claro→escuro); este hook reconcilia com o valor real do
// banco (fonte de verdade — importa se o usuário trocou de tema em outro aparelho).
//
// 2026-09-26 (pedido do Felipe): terceira opção "system" (Automático) — segue o tema do
// celular/computador via `prefers-color-scheme`, inclusive AO VIVO (listener de `change`: se o
// celular troca pro escuro à noite com o app aberto, o app troca junto sem recarregar). Virou o
// default da coluna. `preference` = o que o usuário escolheu (light/dark/system); `theme` = o que
// está de fato aplicado (light/dark).
const STORAGE_KEY = "zmeta_theme";
const PREFS = ["light", "dark", "system"];

function systemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(pref) {
  return pref === "system" ? systemTheme() : pref;
}

function applyThemeClass(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function readCachedPref() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return PREFS.includes(v) ? v : "system";
  } catch (e) {
    return "system";
  }
}

export function useThemeToggle(userId) {
  // null até montar: lido do cache só no client (evita divergência de hidratação SSR x client e
  // evita aplicar "system" por um instante antes de saber que o usuário fixou claro/escuro).
  const [preference, setPreferenceState] = useState(null);
  const [theme, setTheme] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    setPreferenceState((p) => p || readCachedPref());
  }, []);

  // Aplica o tema sempre que a preferência muda e, no Automático, acompanha o sistema ao vivo.
  useEffect(() => {
    if (!preference) return;
    const apply = () => {
      const t = resolveTheme(preference);
      applyThemeClass(t);
      setTheme(t);
    };
    apply();
    if (preference !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else if (mq.addListener) mq.addListener(apply); // Safari < 14
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else if (mq.removeListener) mq.removeListener(apply);
    };
  }, [preference]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("profiles").select("theme_preference").eq("id", userId).single();
      if (!active || !PREFS.includes(data?.theme_preference)) return;
      setPreferenceState(data.theme_preference);
      try {
        localStorage.setItem(STORAGE_KEY, data.theme_preference);
      } catch (e) {}
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const setPreference = useCallback(
    (next) => {
      if (!PREFS.includes(next)) return;
      setPreferenceState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (e) {}
      if (userId) {
        supabase.from("profiles").update({ theme_preference: next }).eq("id", userId).then(() => {});
      }
    },
    [userId]
  );

  return { theme, preference: preference || "system", setPreference };
}
