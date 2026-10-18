import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import Providers from "@/components/Providers";
import AppShell from "@/components/navbar/AppShell";
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
    const theme = findTheme(cookieStore.get('fms-theme')?.value);

    return (
        <html lang="en" suppressHydrationWarning data-theme={theme.id === 'light' ? undefined : theme.id}>
            <body className="min-h-svh font-roboto bg-bg-body text-text-primary">
                <Providers>
                    <AppShell>
                        {children}
                    </AppShell>
                </Providers>
            </body>
        </html>
    );
}
