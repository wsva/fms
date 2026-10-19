// Server-safe i18n for the public marketing site (the `(site)` route group).
//
// Unlike the desktop app (a Next.js *static export*, which has no server runtime
// and must resolve the locale client-side), the website runs as a real server
// (`output: 'standalone'`). So the landing page is rendered on the server and the
// locale is negotiated there — from the `fms-lang` cookie, falling back to the
// request's Accept-Language header. That keeps the localized copy in the initial
// HTML (good for SEO and link previews) with no client-side flash.
//
// This module holds no server-only imports, so client components (e.g. the
// language toggle) can import `LOCALES`/`Locale` from it too. `resolveLocale`
// takes the cookie/header values as plain arguments rather than reading
// `next/headers` itself, which keeps it usable on either side.

export type Locale = "en" | "de";

export const LOCALES: { code: Locale; label: string }[] = [
    { code: "en", label: "English" },
    { code: "de", label: "Deutsch" },
];

/** Cookie the language toggle writes; read back by the server on the next render. */
export const LANG_COOKIE = "fms-lang";

/** One year, in seconds — the max-age for the locale cookie. */
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Writes the locale cookie from the browser so the next server render negotiates
 * the new language. Kept in this plain module (not inside a component/hook body)
 * because the React Compiler's immutability rule forbids mutating a global such
 * as `document.cookie` from component scope.
 */
export function setLangCookie(next: Locale): void {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; samesite=lax`;
}

const dict = {
    en: {
        "brand.name": "FmS",
        "brand.tagline": "Fluent by ear",
        "nav.features": "Features",
        "nav.how": "How it works",
        "nav.download": "Download",
        "nav.privacy": "Privacy",
        "nav.openApp": "Open app",
        "nav.signIn": "Sign in",
        "nav.language": "Language",

        "hero.badge": "Free & open source · Windows · Linux",
        "hero.title": "Learn a language by listening, not by scrolling",
        "hero.subtitle":
            "FmS turns any audio into dictation practice. Import a dataset, generate subtitles locally with on-device speech recognition, and train your ear one cue at a time — with spaced-repetition cards, read-aloud scoring and cross-device sync.",
        "hero.ctaDownload": "Download for free",
        "hero.ctaOpenApp": "Open the app",
        "hero.ctaSignIn": "Sign in",
        "hero.note": "No account required. Your audio and progress never leave your device.",

        "features.heading": "Everything you need to train your ear",
        "features.sub": "A desktop-first toolkit built around real listening practice.",
        "features.dictation.title": "Dictation practice",
        "features.dictation.desc":
            "Transcribe what you hear against waveform-synced cues, with instant diffing and per-cue replay.",
        "features.cards.title": "Spaced repetition",
        "features.cards.desc":
            "Turn phrases into flashcards and review them with an SM-2 scheduler and full-text search.",
        "features.readaloud.title": "Read-aloud scoring",
        "features.readaloud.desc":
            "Record yourself reading a passage and get a similarity score from on-device speech recognition.",
        "features.stt.title": "Local speech recognition",
        "features.stt.desc":
            "Generate subtitles with bundled Parakeet models — everything runs offline on your machine.",
        "features.sync.title": "Cross-device sync",
        "features.sync.desc":
            "Pair your phone and PC over the local network or a hub and keep progress in sync.",
        "features.agent.title": "Agent friendly",
        "features.agent.desc":
            "Every feature is exposed through a built-in MCP server, so AI agents can drive the app too.",

        "how.heading": "How it works",
        "how.sub": "From raw audio to daily practice in four steps.",
        "how.step1.title": "Import a dataset",
        "how.step1.desc": "Drop in audio or video files plus optional reference text.",
        "how.step2.title": "Generate subtitles",
        "how.step2.desc": "Local STT transcribes each track and aligns it into timed cues.",
        "how.step3.title": "Practice dictation",
        "how.step3.desc": "Listen, type what you hear, and compare against the cue.",
        "how.step4.title": "Review & track",
        "how.step4.desc": "Save cards, schedule reviews and watch your streak grow.",

        "download.heading": "Download FmS",
        "download.sub": "Grab the latest release for your platform. It's free, and the source is open.",
        "download.windows": "Windows",
        "download.linux": "Linux",
        "download.android": "Android",
        "download.experimental": "Experimental",
        "download.unavailable":
            "Couldn't reach GitHub right now. You can still browse all releases manually.",
        "download.viewAll": "View all releases",
        "download.version": "Latest version",
        "download.detectHint": "Detected your platform — the recommended build is highlighted.",

        "privacy.heading": "Private by design",
        "privacy.p1":
            "FmS is local-first. Audio, generated subtitles, waveforms and your progress are stored on your own device — nothing is uploaded to a server to be processed.",
        "privacy.p2":
            "Speech recognition runs entirely offline using bundled models. There is no telemetry, no analytics and no third-party tracking in the app.",
        "privacy.p3":
            "Cross-device sync is opt-in and travels over your own network or a hub you control. The source code is open so you can verify all of this yourself.",

        "footer.rights": "All rights reserved.",
        "footer.github": "GitHub",
        "footer.privacy": "Privacy",
        "footer.builtWith": "Built with Tauri, Next.js and Rust.",

        "meta.title": "FmS — learn a language by listening",
        "meta.description":
            "FmS turns any audio into dictation practice with local speech recognition, spaced-repetition cards and cross-device sync. Free and open source for Windows and Linux.",
    },
    de: {
        "brand.name": "FmS",
        "brand.tagline": "Fluent übers Ohr",
        "nav.features": "Funktionen",
        "nav.how": "So funktioniert's",
        "nav.download": "Download",
        "nav.privacy": "Datenschutz",
        "nav.openApp": "App öffnen",
        "nav.signIn": "Anmelden",
        "nav.language": "Sprache",

        "hero.badge": "Kostenlos & Open Source · Windows · Linux",
        "hero.title": "Eine Sprache durch Hören lernen — nicht durch Scrollen",
        "hero.subtitle":
            "FmS verwandelt jedes Audio in Diktat-Training. Importiere ein Dataset, erzeuge Untertitel lokal mit On-Device-Spracherkennung und trainiere dein Gehör Cue für Cue — mit Spaced-Repetition-Karten, Vorlese-Bewertung und geräteübergreifender Synchronisation.",
        "hero.ctaDownload": "Kostenlos herunterladen",
        "hero.ctaOpenApp": "App öffnen",
        "hero.ctaSignIn": "Anmelden",
        "hero.note": "Kein Konto nötig. Deine Audiodaten und dein Fortschritt bleiben auf deinem Gerät.",

        "features.heading": "Alles, was du fürs Hörtraining brauchst",
        "features.sub": "Ein Desktop-First-Werkzeugkasten rund um echtes Hörverstehen.",
        "features.dictation.title": "Diktat-Training",
        "features.dictation.desc":
            "Transkribiere Gehörtes gegen wellenform-synchronisierte Cues — mit sofortigem Vergleich und Cue-Wiederholung.",
        "features.cards.title": "Spaced Repetition",
        "features.cards.desc":
            "Verwandle Wendungen in Karteikarten und wiederhole sie mit SM-2-Planer und Volltextsuche.",
        "features.readaloud.title": "Vorlese-Bewertung",
        "features.readaloud.desc":
            "Nimm dich beim Vorlesen auf und erhalte eine Ähnlichkeitsbewertung aus der On-Device-Spracherkennung.",
        "features.stt.title": "Lokale Spracherkennung",
        "features.stt.desc":
            "Erzeuge Untertitel mit gebündelten Parakeet-Modellen — alles läuft offline auf deinem Rechner.",
        "features.sync.title": "Geräteübergreifende Sync",
        "features.sync.desc":
            "Kopple Telefon und PC im lokalen Netz oder über einen Hub und halte den Fortschritt synchron.",
        "features.agent.title": "Agenten-freundlich",
        "features.agent.desc":
            "Jede Funktion ist über einen eingebauten MCP-Server erreichbar, sodass auch KI-Agenten die App steuern können.",

        "how.heading": "So funktioniert's",
        "how.sub": "In vier Schritten vom rohen Audio zur täglichen Übung.",
        "how.step1.title": "Dataset importieren",
        "how.step1.desc": "Audio- oder Videodateien plus optionalen Referenztext hinzufügen.",
        "how.step2.title": "Untertitel erzeugen",
        "how.step2.desc": "Lokale STT transkribiert jeden Titel und richtet ihn in zeitliche Cues aus.",
        "how.step3.title": "Diktat üben",
        "how.step3.desc": "Hören, tippen was du hörst und mit dem Cue vergleichen.",
        "how.step4.title": "Wiederholen & verfolgen",
        "how.step4.desc": "Karten speichern, Wiederholungen planen und deinen Streak wachsen sehen.",

        "download.heading": "FmS herunterladen",
        "download.sub": "Hole dir die neueste Version für deine Plattform. Kostenlos und quelloffen.",
        "download.windows": "Windows",
        "download.linux": "Linux",
        "download.android": "Android",
        "download.experimental": "Experimentell",
        "download.unavailable":
            "GitHub ist gerade nicht erreichbar. Du kannst alle Releases dennoch manuell durchsehen.",
        "download.viewAll": "Alle Releases anzeigen",
        "download.version": "Neueste Version",
        "download.detectHint": "Plattform erkannt — der empfohlene Build ist hervorgehoben.",

        "privacy.heading": "Privat by design",
        "privacy.p1":
            "FmS ist local-first. Audio, erzeugte Untertitel, Wellenformen und dein Fortschritt werden auf deinem eigenen Gerät gespeichert — nichts wird zur Verarbeitung auf einen Server geladen.",
        "privacy.p2":
            "Spracherkennung läuft vollständig offline mit gebündelten Modellen. Es gibt keine Telemetrie, keine Analytics und kein Tracking durch Dritte in der App.",
        "privacy.p3":
            "Geräteübergreifende Sync ist opt-in und läuft über dein eigenes Netz oder einen Hub, den du kontrollierst. Der Quellcode ist offen, damit du all das selbst prüfen kannst.",

        "footer.rights": "Alle Rechte vorbehalten.",
        "footer.github": "GitHub",
        "footer.privacy": "Datenschutz",
        "footer.builtWith": "Gebaut mit Tauri, Next.js und Rust.",

        "meta.title": "FmS — eine Sprache durch Hören lernen",
        "meta.description":
            "FmS verwandelt jedes Audio in Diktat-Training mit lokaler Spracherkennung, Spaced-Repetition-Karten und geräteübergreifender Sync. Kostenlos und open source für Windows und Linux.",
    },
} as const satisfies Record<string, Record<string, string>>;

export type DictKey = keyof (typeof dict)["en"];

export type Translate = (key: DictKey) => string;

/** Returns a translator bound to `locale`, falling back to English for gaps. */
export function makeT(locale: Locale): Translate {
    return (key) => dict[locale][key] ?? dict.en[key];
}

/**
 * Negotiates the locale for a request: an explicit `fms-lang` cookie wins, then
 * the Accept-Language header (any `de` variant), else English. Values are passed
 * in so this stays free of `next/headers` and is importable from the client.
 */
export function resolveLocale(
    cookieValue: string | undefined,
    acceptLanguage: string | null | undefined,
): Locale {
    if (cookieValue === "en" || cookieValue === "de") return cookieValue;
    if (acceptLanguage) {
        // Prefer the highest-weighted `de*` tag; a bare match is enough for us.
        const prefersGerman = acceptLanguage
            .split(",")
            .some((part) => /^\s*de(-|;|\s|$)/i.test(part));
        if (prefersGerman) return "de";
    }
    return "en";
}
