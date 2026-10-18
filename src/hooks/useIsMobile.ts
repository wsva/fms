"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe mobile-viewport flag for the toolbar kit.
 *
 * Website port of the app's `useIsMobile`: the app resolves a Tauri webview
 * platform flag in an effect, but on the website "mobile" is simply a narrow
 * viewport, so matchMedia answers it directly. Read through
 * `useSyncExternalStore` with a `false` server snapshot — the first client
 * render may flip to true, which React handles as a store change rather than a
 * hydration mismatch, and no set-state-in-effect is involved.
 *
 * The 1023px cutoff matches the `lg` breakpoint the AppShell sidebar uses, so
 * toolbar label collapsing and the sidebar/drawer switch agree.
 */
const QUERY = "(max-width: 1023px)";

function subscribe(onStoreChange: () => void): () => void {
    const mql = window.matchMedia(QUERY);
    mql.addEventListener("change", onStoreChange);
    return () => mql.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
    return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
    return false;
}

export function useIsMobile(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useIsMobile;
