import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import Providers from "@/components/Providers";
import TopNav from "@/components/navbar/TopNav";
import { findTheme } from "@/lib/themes";

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
    const themeId = cookieStore.get('fms-theme')?.value;
    const theme = findTheme(themeId);

    const themeVars = Object.fromEntries(
        Object.entries(theme.scale).map(([n, v]) => [`--color-sand-${n}`, v])
    ) as React.CSSProperties;

    return (
        <html lang="en" suppressHydrationWarning className={theme.dark ? 'dark' : ''} style={themeVars}>
            <body className="min-h-svh font-roboto bg-sand-200 pb-20">
                <Providers>
                    <TopNav />
                    <main className="container mx-auto">
                        {children}
                    </main>
                </Providers>
            </body>
        </html>
    );
}
