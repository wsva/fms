import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resolveLocale, makeT, LANG_COOKIE } from "@/lib/site-i18n";
import { fetchLatestRelease, detectPlatformFromUA } from "@/lib/github-release";
import Landing from "@/components/site/Landing";

// Public marketing landing page at `/`. Rendered on the server so the localized
// copy, the latest GitHub release download links and the session-aware CTA are
// all in the initial HTML (crawlable, no client flash). The `(site)` group has no
// AppShell chrome — the root layout no longer wraps children in it — so this page
// owns the full viewport. Signed-in visitors get an "Open app" CTA to /home;
// everyone else gets "Sign in".

export async function generateMetadata(): Promise<Metadata> {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const locale = resolveLocale(cookieStore.get(LANG_COOKIE)?.value, headerStore.get("accept-language"));
    const t = makeT(locale);
    return {
        title: t("meta.title"),
        description: t("meta.description"),
    };
}

export default async function SiteHome() {
    const cookieStore = await cookies();
    const headerStore = await headers();

    const locale = resolveLocale(cookieStore.get(LANG_COOKIE)?.value, headerStore.get("accept-language"));
    const platform = detectPlatformFromUA(headerStore.get("user-agent"));

    // A missing/invalid session should never break the public landing.
    const session = await auth.api.getSession({ headers: headerStore }).catch(() => null);
    const release = await fetchLatestRelease();

    return (
        <Landing
            locale={locale}
            signedIn={!!session?.user}
            release={release}
            platform={platform}
        />
    );
}
