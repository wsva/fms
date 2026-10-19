// Public marketing landing page. The (site) route group renders WITHOUT the
// AppShell chrome (the root layout no longer wraps children in it), so this
// page owns its full-viewport presentation.
//
// Phase 1 placeholder — the full landing (hero, features, how-it-works,
// platform downloads, EN/DE) is built next.
export default function SiteHome() {
    return (
        <main className="min-h-svh flex flex-col items-center justify-center gap-2 bg-bg-body text-text-primary">
            <h1 className="text-3xl font-semibold">FmS</h1>
            <p className="text-text-secondary">Fremdsprachen machen Spaß!</p>
        </main>
    );
}
