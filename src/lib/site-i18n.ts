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

/**
 * Locales currently published on the site. Translations for other locales stay
 * in the dictionary below; add a code here (and to `PUBLISHED_LOCALES`) to turn
 * one back on. While only English is published, `resolveLocale` pins every
 * request to English and `LanguageToggle` renders nothing.
 */
export const PUBLISHED_LOCALES: Locale[] = ["en"];

const ALL_LOCALES: { code: Locale; label: string }[] = [
    { code: "en", label: "English" },
    { code: "de", label: "Deutsch" },
];

export const LOCALES: { code: Locale; label: string }[] = ALL_LOCALES.filter(
    ({ code }) => PUBLISHED_LOCALES.includes(code),
);

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
        "nav.why": "Why FmS",
        "nav.how": "How it works",
        "nav.download": "Download",
        "nav.privacy": "Privacy",
        "nav.faq": "FAQ",
        "nav.openApp": "Open workspace",
        "nav.signIn": "Sign in",
        "nav.language": "Language",

        "hero.badge": "Free · open source · runs fully offline",
        "hero.title": "Learn a language by listening, not by scrolling",
        "hero.subtitle":
            "Bring any audiobook, podcast or lecture — FmS transcribes it on your machine and turns it into listening, speaking, reading and writing practice. No account, and nothing ever leaves your device.",
        "hero.ctaDownload": "Download for free",
        "hero.ctaOpenApp": "Open the workspace",
        "hero.ctaSignIn": "Sign in",
        "hero.note": "No account required. Your audio and progress never leave your device.",
        "hero.problem":
            "Most apps gamify reading and translation. Listening — the hardest skill — gets the least training. FmS is built to fix that.",

        "why.heading": "Why FmS",
        "why.sub": "What makes it different from a language app on your phone.",
        "why.audio.title": "Your audio, not a fixed course",
        "why.audio.desc":
            "Import any podcast, audiobook or lecture in the language you are learning and make it your curriculum.",
        "why.private.title": "Private by default",
        "why.private.desc":
            "Speech recognition runs on-device and offline. No account, no uploads, no telemetry.",
        "why.loop.title": "A full practice loop",
        "why.loop.desc":
            "Listen, type, read aloud and review — with instant feedback from local models.",

        "skills.heading": "Training for all four skills",
        "skills.sub":
            "Real fluency needs input you understand and output you produce. FmS closes both halves.",
        "skills.input": "Input",
        "skills.output": "Output",
        "skills.listening.title": "Listening",
        "skills.listening.desc": "Dictation and listen-along against your own audio.",
        "skills.reading.title": "Reading",
        "skills.reading.desc": "Books, subtitles and searchable notes.",
        "skills.speaking.title": "Speaking",
        "skills.speaking.desc": "Read aloud and get pronunciation feedback.",
        "skills.writing.title": "Writing",
        "skills.writing.desc": "Type what you hear and build a word bank.",
        "skills.who":
            "Made for self-study learners, exam prep (IELTS, TOEFL, JLPT) and anyone who would rather learn from real audio than a canned course.",

        "features.heading": "How FmS builds each skill",
        "features.sub": "Six tools that turn the audio you love into deliberate practice.",
        "features.tag.skills": "Trains",
        "features.dictation.title": "Dictation practice",
        "features.dictation.desc":
            "Type what you hear and see exactly where you missed it, cue by cue.",
        "features.dictation.tag": "Listening · Writing",
        "features.books.title": "Books",
        "features.books.desc":
            "Turn a whole book into chapters and sentences you can read, hear and shadow.",
        "features.books.tag": "Reading · Listening",
        "features.readaloud.title": "Read-aloud scoring",
        "features.readaloud.desc":
            "Record yourself and get instant pronunciation feedback, fully offline.",
        "features.readaloud.tag": "Speaking",
        "features.cards.title": "Spaced repetition",
        "features.cards.desc":
            "Save the words and phrases you missed; an SM-2 schedule brings them back.",
        "features.cards.tag": "Writing · Reading",
        "features.wiki.title": "Wiki notes",
        "features.wiki.desc":
            "Keep linked notes on what you learn, searchable across your library.",
        "features.wiki.tag": "Reading · Writing",
        "features.agent.title": "Agent friendly",
        "features.agent.desc":
            "Every feature is exposed through a built-in MCP server, so AI agents can drive the app too.",
        "features.agent.tag": "For power users",

        "how.heading": "From something you want to hear to a daily habit",
        "how.sub": "Four steps, all on your own machine.",
        "how.step1.title": "Pick your audio",
        "how.step1.desc": "Choose a podcast, audiobook chapter or lecture in the language you are learning.",
        "how.step2.title": "FmS writes the subtitles",
        "how.step2.desc": "Local speech recognition transcribes it on your device in seconds.",
        "how.step3.title": "Practice",
        "how.step3.desc": "Type what you hear, then read aloud and get instant feedback.",
        "how.step4.title": "Review",
        "how.step4.desc": "Your misses come back as cards and notes, spaced automatically.",

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
        "download.platforms":
            "Windows and Linux are fully supported; Android ships as an experimental build.",
        "download.firstRun":
            "Free and open source. On first run you'll download a small offline speech model.",

        "faq.heading": "Frequently asked questions",
        "faq.q1": "Does FmS need an internet connection?",
        "faq.a1": "No. Speech recognition and everything else run on your device. You only need the internet to download the app and the models.",
        "faq.q2": "Which languages can I practice?",
        "faq.a2": "Any language you have audio for. FmS works with your own recordings and files rather than a fixed course.",
        "faq.q3": "Do I need an account?",
        "faq.a3": "No account is required — your audio and progress stay on your device. An account is only for optional cross-device sync.",
        "faq.q4": "Is there a macOS or iOS version?",
        "faq.a4": "FmS currently ships for Windows, Linux and Android.",

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
        "footer.docs": "Documentation",
        "footer.motto": "Your ear, your audio, your device.",
        "footer.builtWith": "Built with Tauri, Next.js and Rust.",

        "meta.title": "FmS — learn a language by listening",
        "meta.description":
            "Bring any audiobook, podcast or lecture and turn it into listening, speaking, reading and writing practice. FmS transcribes on-device and offline — no account, free and open source for Windows, Linux and Android.",
    },
    de: {
        "brand.name": "FmS",
        "brand.tagline": "Fluent übers Ohr",
        "nav.features": "Funktionen",
        "nav.why": "Warum FmS",
        "nav.how": "So funktioniert's",
        "nav.download": "Download",
        "nav.privacy": "Datenschutz",
        "nav.faq": "FAQ",
        "nav.openApp": "Workspace öffnen",
        "nav.signIn": "Anmelden",
        "nav.language": "Sprache",

        "hero.badge": "Kostenlos · Open Source · läuft vollständig offline",
        "hero.title": "Eine Sprache durch Hören lernen — nicht durch Scrollen",
        "hero.subtitle":
            "Hole dir ein Hörbuch, einen Podcast oder eine Vorlesung — FmS transkribiert sie auf deinem Gerät und macht daraus Hör-, Sprech-, Lese- und Schreibtraining. Kein Konto, und nichts verlässt je dein Gerät.",
        "hero.ctaDownload": "Kostenlos herunterladen",
        "hero.ctaOpenApp": "Workspace öffnen",
        "hero.ctaSignIn": "Anmelden",
        "hero.note": "Kein Konto nötig. Deine Audiodaten und dein Fortschritt bleiben auf deinem Gerät.",
        "hero.problem":
            "Die meisten Apps gamifizieren Lesen und Übersetzen. Das Hören — die schwerste Fähigkeit — bekommt am wenigsten Training. FmS schließt diese Lücke.",

        "why.heading": "Warum FmS",
        "why.sub": "Was es von einer Sprach-App auf dem Handy unterscheidet.",
        "why.audio.title": "Dein Audio, kein festgelegter Kurs",
        "why.audio.desc":
            "Importiere jeden Podcast, jedes Hörbuch oder jede Vorlesung der Sprache, die du lernst — und mache sie zu deinem Lehrplan.",
        "why.private.title": "Standardmäßig privat",
        "why.private.desc":
            "Spracherkennung läuft on-device und offline. Kein Konto, keine Uploads, keine Telemetrie.",
        "why.loop.title": "Ein vollständiger Übungsloop",
        "why.loop.desc":
            "Hören, tippen, vorlesen und wiederholen — mit sofortiger Rückmeldung von lokalen Modellen.",

        "skills.heading": "Training für alle vier Fähigkeiten",
        "skills.sub":
            "Echte Sprachkompetenz braucht verständlichen Input und eigenen Output. FmS schließt beide Hälften.",
        "skills.input": "Input",
        "skills.output": "Output",
        "skills.listening.title": "Hören",
        "skills.listening.desc": "Diktat und Mit-Hören deines eigenen Audios.",
        "skills.reading.title": "Lesen",
        "skills.reading.desc": "Bücher, Untertitel und durchsuchbare Notizen.",
        "skills.speaking.title": "Sprechen",
        "skills.speaking.desc": "Lies vor und erhalte Rückmeldung zur Aussprache.",
        "skills.writing.title": "Schreiben",
        "skills.writing.desc": "Tippe, was du hörst, und baue einen Wortschatz auf.",
        "skills.who":
            "Gemacht für Selbstlerner, Prüfungen (IELTS, TOEFL, JLPT) und alle, die lieber mit echtem Audio lernen als mit einem Fertigkurs.",

        "features.heading": "Wie FmS jede Fähigkeit trainiert",
        "features.sub": "Sechs Werkzeuge, die dein Lieblings-Audio in gezieltes Üben verwandeln.",
        "features.tag.skills": "Trainiert",
        "features.dictation.title": "Diktat-Training",
        "features.dictation.desc":
            "Tippe, was du hörst, und sieh genau, wo du dich vertan hast — Cue für Cue.",
        "features.dictation.tag": "Hören · Schreiben",
        "features.books.title": "Bücher",
        "features.books.desc":
            "Verwandle ein ganzes Buch in Kapitel und Sätze zum Lesen, Hören und Nachsprechen.",
        "features.books.tag": "Lesen · Hören",
        "features.readaloud.title": "Vorlese-Bewertung",
        "features.readaloud.desc":
            "Nimm dich beim Vorlesen auf und erhalte sofortige Aussprache-Rückmeldung — komplett offline.",
        "features.readaloud.tag": "Sprechen",
        "features.cards.title": "Spaced Repetition",
        "features.cards.desc":
            "Speichere die Wörter und Wendungen, die du verpasst hast; ein SM-2-Plan holt sie zurück.",
        "features.cards.tag": "Schreiben · Lesen",
        "features.wiki.title": "Wiki-Notizen",
        "features.wiki.desc":
            "Halte verknüpfte Notizen zu dem fest, was du lernst — durchsuchbar über deine Bibliothek.",
        "features.wiki.tag": "Lesen · Schreiben",
        "features.agent.title": "Agenten-freundlich",
        "features.agent.desc":
            "Jede Funktion ist über einen eingebauten MCP-Server erreichbar, sodass KI-Agenten die App steuern können.",
        "features.agent.tag": "Für Power-User",

        "how.heading": "Vom gewünschten Audio zur täglichen Gewohnheit",
        "how.sub": "Vier Schritte, alle auf deinem eigenen Rechner.",
        "how.step1.title": "Wähle dein Audio",
        "how.step1.desc": "Wähle einen Podcast, ein Hörbuch-Kapitel oder eine Vorlesung der Sprache, die du lernst.",
        "how.step2.title": "FmS schreibt die Untertitel",
        "how.step2.desc": "Lokale Spracherkennung transkribiert sie in Sekunden auf deinem Gerät.",
        "how.step3.title": "Üben",
        "how.step3.desc": "Tippe, was du hörst, lies dann vor und erhalte sofortige Rückmeldung.",
        "how.step4.title": "Wiederholen",
        "how.step4.desc": "Deine Fehler kommen als Karten und Notizen zurück — automatisch geplant.",

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
        "download.platforms":
            "Windows und Linux werden voll unterstützt; Android erscheint als experimenteller Build.",
        "download.firstRun":
            "Kostenlos und quelloffen. Beim ersten Start lädst du ein kleines Offline-Sprachmodell herunter.",

        "faq.heading": "Häufige Fragen",
        "faq.q1": "Braucht FmS eine Internetverbindung?",
        "faq.a1": "Nein. Spracherkennung und alles andere laufen auf deinem Gerät. Internet brauchst du nur, um die App und die Modelle herunterzuladen.",
        "faq.q2": "Welche Sprachen kann ich üben?",
        "faq.a2": "Jede Sprache, für die du Audio hast. FmS arbeitet mit deinen eigenen Aufnahmen und Dateien statt mit einem festen Kurs.",
        "faq.q3": "Brauche ich ein Konto?",
        "faq.a3": "Nein, ein Konto ist nicht nötig — deine Audiodaten und dein Fortschritt bleiben auf deinem Gerät. Ein Konto dient nur der optionalen geräteübergreifenden Sync.",
        "faq.q4": "Gibt es eine macOS- oder iOS-Version?",
        "faq.a4": "FmS erscheint derzeit für Windows, Linux und Android.",

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
        "footer.docs": "Dokumentation",
        "footer.motto": "Dein Gehör, dein Audio, dein Gerät.",
        "footer.builtWith": "Gebaut mit Tauri, Next.js und Rust.",

        "meta.title": "FmS — eine Sprache durch Hören lernen",
        "meta.description":
            "Hole dir ein Hörbuch, einen Podcast oder eine Vorlesung und mache daraus Hör-, Sprech-, Lese- und Schreibtraining. FmS transkribiert on-device und offline — kein Konto, kostenlos und quelloffen für Windows, Linux und Android.",
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
 * the Accept-Language header (any `de` variant), else English — but only among
 * the currently `PUBLISHED_LOCALES` (unpublished resolutions fall back to
 * English). Values are passed in so this stays free of `next/headers` and is
 * importable from the client.
 */
export function resolveLocale(
    cookieValue: string | undefined,
    acceptLanguage: string | null | undefined,
): Locale {
    const fallback: Locale = PUBLISHED_LOCALES[0] ?? "en";
    const published = (candidate: Locale): Locale =>
        PUBLISHED_LOCALES.includes(candidate) ? candidate : fallback;
    if (cookieValue === "en" || cookieValue === "de") return published(cookieValue);
    if (acceptLanguage) {
        // Prefer the highest-weighted `de*` tag; a bare match is enough for us.
        const prefersGerman = acceptLanguage
            .split(",")
            .some((part) => /^\s*de(-|;|\s|$)/i.test(part));
        if (prefersGerman) return published("de");
    }
    return published("en");
}
