"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

// Tema claro/escuro (2026-09) — preferência manual, persistida em profiles.theme_preference,
// aplicada via classe `.dark` em <html> (ver tailwind.config.js darkMode:'class' e as
// variáveis de cor em app/globals.css). O script inline em app/layout.js já aplica o valor
// cacheado em localStorage antes do primeiro paint (evita flash claro→escuro); este hook só
// reconcilia com o valor real do banco (fonte de verdade — importa se o usuário trocou de tema
// em outro aparelho) e expõe o toggle usado no AppShell.
const STORAGE_KEY = "zmeta_theme";

function applyThemeClass(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useThemeToggle(userId) {
  const [theme, setTheme] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("profiles").select("theme_preference").eq("id", userId).single();
      if (!active || !data?.theme_preference) return;
      setTheme((current) => {
        if (data.theme_preference !== current) {
          applyThemeClass(data.theme_preference);
          return data.theme_preference;
        }
        return current;
      });
      try {
        localStorage.setItem(STORAGE_KEY, data.theme_preference);
      } catch (e) {}
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const toggleTheme = useCallback(async () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      applyThemeClass(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (e) {}
      if (userId) {
        supabase.from("profiles").update({ theme_preference: next }).eq("id", userId).then(() => {});
      }
      return next;
    });
  }, [userId]);

  return { theme, toggleTheme };
}
