import {
    Headphones,
    Layers,
    Mic,
    Cpu,
    RefreshCw,
    Bot,
    Code2,
    ArrowRight,
    ShieldCheck,
    Monitor,
    Terminal,
    Smartphone,
    Download,
    ExternalLink,
    type LucideIcon,
} from "lucide-react";
import { makeT, type DictKey, type Locale } from "@/lib/site-i18n";
import {
    REPO_URL,
    RELEASES_URL,
    pickAsset,
    type GitHubRelease,
    type Platform,
} from "@/lib/github-release";
import LanguageToggle from "./LanguageToggle";
import SignInCta from "./SignInCta";

// The public marketing landing rendered at `/`. This is a *server* component: the
// locale, session state, latest release and detected platform are all resolved on
// the server (see app/(site)/page.tsx) and baked into the HTML, so the copy is
// crawlable and there is no client-side flash. The only client island is the
// language toggle. The logo mark is /icon-512.png from public/, served as a
// plain <img>: the standalone deployment has no `sharp`, so /_next/image would
// answer 400 (the rest of the site already avoids next/image for the same reason).

const LOGO = "/icon-512.png";
const APP_HREF = "/home";

const FEATURES: { titleKey: DictKey; descKey: DictKey; icon: LucideIcon }[] = [
    { titleKey: "features.dictation.title", descKey: "features.dictation.desc", icon: Headphones },
    { titleKey: "features.cards.title", descKey: "features.cards.desc", icon: Layers },
    { titleKey: "features.readaloud.title", descKey: "features.readaloud.desc", icon: Mic },
    { titleKey: "features.stt.title", descKey: "features.stt.desc", icon: Cpu },
    { titleKey: "features.sync.title", descKey: "features.sync.desc", icon: RefreshCw },
    { titleKey: "features.agent.title", descKey: "features.agent.desc", icon: Bot },
];

const STEPS: { titleKey: DictKey; descKey: DictKey }[] = [
    { titleKey: "how.step1.title", descKey: "how.step1.desc" },
    { titleKey: "how.step2.title", descKey: "how.step2.desc" },
    { titleKey: "how.step3.title", descKey: "how.step3.desc" },
    { titleKey: "how.step4.title", descKey: "how.step4.desc" },
];

const DOWNLOAD_CARDS: { platform: Platform; labelKey: DictKey; icon: LucideIcon; experimental?: boolean }[] = [
    { platform: "windows", labelKey: "download.windows", icon: Monitor },
    { platform: "linux", labelKey: "download.linux", icon: Terminal },
    { platform: "android", labelKey: "download.android", icon: Smartphone, experimental: true },
];

export interface LandingProps {
    locale: Locale;
    /** True when the visitor has an active session — swaps the CTA to "Open workspace". */
    signedIn: boolean;
    /** Latest GitHub release, or null when it could not be fetched. */
    release: GitHubRelease | null;
    /** Platform guessed from the request User-Agent, for highlighting a card. */
    platform: Platform | null;
}

export default function Landing({ locale, signedIn, release, platform }: LandingProps) {
    const t = makeT(locale);
    const ctaLabel = signedIn ? t("nav.openApp") : t("nav.signIn");
    const heroCtaLabel = signedIn ? t("hero.ctaOpenApp") : t("hero.ctaSignIn");

    return (
        <div className="min-h-svh bg-bg-body text-text-primary">
            {/* Nav */}
            <header className="sticky top-0 z-40 border-b border-border-default bg-bg-body/80 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
                    <a href="#top" className="flex items-center gap-2 font-semibold">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={LOGO} alt="" width={28} height={28} className="h-7 w-7 rounded-lg" draggable={false} />
                        <span>{t("brand.name")}</span>
                        <span className="hidden text-sm font-normal text-text-tertiary sm:inline">{t("brand.tagline")}</span>
                    </a>

                    <nav className="hidden items-center gap-6 text-sm text-text-secondary md:flex">
                        <a href="#features" className="hover:text-text-primary">{t("nav.features")}</a>
                        <a href="#how" className="hover:text-text-primary">{t("nav.how")}</a>
                        <a href="#download" className="hover:text-text-primary">{t("nav.download")}</a>
                        <a href="#privacy" className="hover:text-text-primary">{t("nav.privacy")}</a>
                    </nav>

                    <div className="flex items-center gap-3">
                        <LanguageToggle locale={locale} />
                        <SignInCta signedIn={signedIn} appHref={APP_HREF} className="hidden items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover sm:inline-flex">
                            {ctaLabel}
                            <ArrowRight className="h-4 w-4" />
                        </SignInCta>
                    </div>
                </div>
            </header>

            <main id="top">
                {/* Hero */}
                <section className="px-6 py-24 sm:py-32">
                    <div className="mx-auto max-w-3xl text-center">
                        <span className="inline-flex items-center rounded-full border border-border-default bg-bg-card px-3 py-1 text-xs font-medium text-text-secondary">{t("hero.badge")}</span>
                        <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">{t("hero.title")}</h1>
                        <p className="mt-6 text-lg text-text-secondary">{t("hero.subtitle")}</p>
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                            <a href="#download" className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 font-medium text-white transition-colors hover:bg-accent-hover">
                                {t("hero.ctaDownload")}
                                <ArrowRight className="h-4 w-4" />
                            </a>
                            <SignInCta signedIn={signedIn} appHref={APP_HREF} className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-bg-card px-5 py-3 font-medium text-text-primary transition-colors hover:border-accent">
                                {heroCtaLabel}
                            </SignInCta>
                        </div>
                        <p className="mt-6 text-sm text-text-tertiary">{t("hero.note")}</p>
                    </div>
                </section>

                {/* Features */}
                <section id="features" className="scroll-mt-20 border-t border-border-default px-6 py-20">
                    <div className="mx-auto max-w-6xl">
                        <h2 className="text-3xl font-bold sm:text-4xl">{t("features.heading")}</h2>
                        <p className="mt-3 max-w-2xl text-text-secondary">{t("features.sub")}</p>
                        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {FEATURES.map(({ titleKey, descKey, icon: Icon }) => (
                                <div key={titleKey} className="rounded-xl border border-border-default bg-bg-card p-6">
                                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-bg text-accent">
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <h3 className="mt-4 font-semibold">{t(titleKey)}</h3>
                                    <p className="mt-2 text-sm text-text-secondary">{t(descKey)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* How it works */}
                <section id="how" className="scroll-mt-20 border-t border-border-default bg-bg-card/40 px-6 py-20">
                    <div className="mx-auto max-w-5xl">
                        <h2 className="text-3xl font-bold sm:text-4xl">{t("how.heading")}</h2>
                        <p className="mt-3 max-w-2xl text-text-secondary">{t("how.sub")}</p>
                        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                            {STEPS.map(({ titleKey, descKey }, i) => (
                                <li key={titleKey} className="relative rounded-xl border border-border-default bg-bg-card p-6">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{i + 1}</span>
                                    <h3 className="mt-4 font-semibold">{t(titleKey)}</h3>
                                    <p className="mt-2 text-sm text-text-secondary">{t(descKey)}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                {/* Download */}
                <DownloadSection t={t} release={release} platform={platform} />

                {/* Privacy */}
                <section id="privacy" className="scroll-mt-20 border-t border-border-default px-6 py-20">
                    <div className="mx-auto max-w-3xl">
                        <h2 className="flex items-center gap-2 text-3xl font-bold sm:text-4xl">
                            <ShieldCheck className="h-8 w-8 text-accent" />
                            {t("privacy.heading")}
                        </h2>
                        <div className="mt-6 space-y-4 text-text-secondary">
                            <p>{t("privacy.p1")}</p>
                            <p>{t("privacy.p2")}</p>
                            <p>{t("privacy.p3")}</p>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-border-default px-6 py-10">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-text-tertiary sm:flex-row">
                    <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={LOGO} alt="" width={24} height={24} className="h-6 w-6 rounded-md" draggable={false} />
                        <span>© {new Date().getFullYear()} {t("brand.name")}. {t("footer.rights")}</span>
                    </div>
                    <div className="flex items-center gap-5">
                        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-text-primary">
                            <Code2 className="h-4 w-4" />
                            {t("footer.github")}
                        </a>
                        <a href="#privacy" className="hover:text-text-primary">{t("footer.privacy")}</a>
                    </div>
                    <span className="text-center sm:text-right">{t("footer.builtWith")}</span>
                </div>
            </footer>
        </div>
    );
}

function DownloadSection({
    t,
    release,
    platform,
}: {
    t: (key: DictKey) => string;
    release: GitHubRelease | null;
    platform: Platform | null;
}) {
    const version = release?.name || release?.tag_name || null;

    return (
        <section id="download" className="scroll-mt-20 border-t border-border-default bg-bg-body px-6 py-20">
            <div className="mx-auto max-w-5xl">
                <h2 className="text-3xl font-bold sm:text-4xl">{t("download.heading")}</h2>
                <p className="mt-3 max-w-2xl text-text-secondary">{t("download.sub")}</p>

                <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-tertiary">
                    {version ? (
                        <span>
                            {t("download.version")}: <span className="font-mono text-text-secondary">{version}</span>
                        </span>
                    ) : (
                        <span>{t("download.unavailable")}</span>
                    )}
                    {platform && <span className="text-accent">{t("download.detectHint")}</span>}
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                    {DOWNLOAD_CARDS.map(({ platform: p, labelKey, icon: Icon, experimental }) => {
                        const asset = release ? pickAsset(release.assets, p) : null;
                        const href = asset?.browser_download_url ?? RELEASES_URL;
                        const isDetected = platform === p;
                        const disabled = !asset && !!release;
                        return (
                            <a
                                key={p}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-disabled={disabled || undefined}
                                className={`group flex flex-col rounded-xl border p-5 transition-colors ${isDetected ? "border-accent bg-accent-bg" : "border-border-default bg-bg-card hover:border-accent"} ${disabled ? "opacity-50" : ""}`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 font-semibold text-text-primary">
                                        <Icon className="h-5 w-5 text-accent" />
                                        {t(labelKey)}
                                    </span>
                                    {experimental && (
                                        <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning-text">{t("download.experimental")}</span>
                                    )}
                                </div>
                                <span className="mt-3 flex items-center gap-1.5 text-sm text-text-secondary">
                                    {asset ? (
                                        <>
                                            <Download className="h-4 w-4" />
                                            <span className="truncate">{asset.name}</span>
                                        </>
                                    ) : (
                                        <>
                                            <ExternalLink className="h-4 w-4" />
                                            {t("download.viewAll")}
                                        </>
                                    )}
                                </span>
                            </a>
                        );
                    })}
                </div>

                <a href={release?.html_url ?? RELEASES_URL} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                    <ExternalLink className="h-4 w-4" />
                    {t("download.viewAll")}
                </a>
            </div>
        </section>
    );
}
