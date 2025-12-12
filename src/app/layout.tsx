import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import TopNav from "@/components/navbar/TopNav";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
    title: "FmS",
    description: "Fremdsprachen machen Spaß!",
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    return (
        <html lang="en">
            <body className="min-h-svh font-roboto bg-sand-200 pb-20">
                <Providers>
                    <TopNav session={session} />
                    <main className="container mx-auto">
                        {children}
                    </main>
                </Providers>
            </body>
        </html>
    );
}
