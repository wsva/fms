import AppShell from "@/components/navbar/AppShell";

// The authenticated app experience: every route inside the (app) group renders
// within the shared AppShell (global Sidebar + TopBar). The bare marketing
// pages live in the sibling (site) group and deliberately skip this chrome.
export default function AppLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return <AppShell>{children}</AppShell>;
}
