"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";

/**
 * Light, dark, or whatever the machine says.
 *
 * WHY THIS HAD TO EXIST. `globals.css` has carried a `[data-theme]` block since
 * the beginning and nothing ever set the attribute, so the only thing that
 * decided which edition you saw was `prefers-color-scheme` — the operating
 * system. A reader whose Mac is in dark mode got the dark edition of Shenava Session
 * with no way at all to ask for the light one, and the usual report of that is
 * "the application is too dark", which sounds like a palette problem and is not.
 *
 * `system` is the default and stores NOTHING. An absent key and a stored
 * "system" would behave alike today and diverge the moment the default changes,
 * so the choice is only written down when it is a choice.
 *
 * The attribute is set before paint by the inline script in the layout, not
 * here: this component mounts after the first paint, and setting it here alone
 * would show the wrong edition for a frame on every single navigation.
 */

const KEY = "shenava-theme";
type Choice = "light" | "dark" | "system";

/**
 * The script that runs before the first paint. It is a string because it has to
 * be inlined into the document head, and it is exported from here so it sits
 * beside the component that agrees with it — a toggle writing one key while the
 * head reads another is a bug with no symptom until somebody reloads.
 */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(KEY)});if(c==="light"||c==="dark"){document.documentElement.setAttribute("data-theme",c)}}catch(e){}})()`;

export function ThemeSwitch() {
  const t = useTranslations("theme");
  // Start at `system` on the server and on the first client render, so the two
  // agree; the effect below corrects it once localStorage can be read.
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    try {
      const held = localStorage.getItem(KEY);
      if (held === "light" || held === "dark") setChoice(held);
    } catch {
      // A private window, or site data blocked. The page still works; it just
      // follows the machine, which is the honest default when nothing is stored.
    }
  }, []);

  const choose = (next: Choice) => {
    setChoice(next);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // The choice still applies to this tab; it just will not outlive it.
    }
  };

  const options: { value: Choice; icon: typeof Sun }[] = [
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
    { value: "system", icon: Monitor },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className="flex items-center gap-0.5 rounded-full p-0.5"
      style={{ border: "1px solid var(--line)" }}
    >
      {options.map(({ value, icon: Icon }) => {
        const on = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            title={t(value)}
            onClick={() => choose(value)}
            className="rounded-full p-1.5"
            style={{
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--paper)" : "var(--ink-faint)",
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="sr-only">{t(value)}</span>
          </button>
        );
      })}
    </div>
  );
}
