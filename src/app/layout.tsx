import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import TopNav from "@/components/navbar/TopNav";
import { themes } from "@/lib/themes";

export const metadata: Metadata = {
    title: "FmS",
    description: "Fremdsprachen machen Spaß!",
};

// Serialise only what the inline script needs (scale + dark flag).
const themeData = JSON.stringify(
    themes.map(({ id, dark, scale }) => ({ id, dark, scale }))
)

// Runs before React hydrates to avoid a flash of the default sand theme.
const foucScript = `(function(){try{
  var id=localStorage.getItem('fms-theme');
  if(!id)return;
  var list=${themeData};
  var t=list.find(function(x){return x.id===id});
  if(!t)return;
  var r=document.documentElement;
  Object.keys(t.scale).forEach(function(n){r.style.setProperty('--color-sand-'+n,t.scale[n])});
  if(t.dark)r.classList.add('dark');
}catch(e){}})()`

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: foucScript }} />
            </head>
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
