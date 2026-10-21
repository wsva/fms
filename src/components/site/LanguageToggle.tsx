"use client";

// Language toggle for the marketing site. The locale lives in the `fms-lang`
// cookie and is read back on the server, so switching writes the cookie and asks
// Next to re-render the server components (`router.refresh()`). A local mirror
// of the value keeps the pressed state responsive while the refresh is in flight.
// When only one locale is published (`LOCALES` is a single entry) there is
// nothing to toggle, so the component renders nothing.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LOCALES, setLangCookie, type Locale } from "@/lib/site-i18n";

export default function LanguageToggle({ locale }: { locale: Locale }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [optimistic, setOptimistic] = useState<Locale>(locale);
    const active = pending ? optimistic : locale;

    if (LOCALES.length <= 1) return null;

    function select(next: Locale) {
        if (next === locale) return;
        setOptimistic(next);
        setLangCookie(next);
        startTransition(() => router.refresh());
    }

    return (
        <div className="flex items-center gap-1 rounded-full border border-border-default bg-bg-card p-0.5" role="group" aria-label="Language">
            {LOCALES.map(({ code, label }) => (
                <button
                    key={code}
                    type="button"
                    onClick={() => select(code)}
                    aria-pressed={active === code}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${active === code ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
