import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import Providers from "@/components/Providers";
import { findTheme } from "@/lib/themes";
import { LANG_COOKIE } from "@/lib/site-i18n";

export const metadata: Metadata = {
    title: "FmS",
    description: "Fremdsprachen machen Spaß!",
    icons: { icon: '/favicon.svg' },
    manifest: '/manifest.webmanifest',
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const cookieStore = await cookies();
    const theme = findTheme(cookieStore.get('fms-theme')?.value);
    // Reflect the marketing-site language choice (fms-lang) in <html lang> for
    // SEO/accessibility; the app itself is English-only so this defaults to en.
    const lang = cookieStore.get(LANG_COOKIE)?.value === 'de' ? 'de' : 'en';

    return (
        <html lang={lang} suppressHydrationWarning data-theme={theme.id === 'light' ? undefined : theme.id}>
            <body className="min-h-svh font-roboto bg-bg-body text-text-primary">
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    );
}
