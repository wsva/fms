import { menuList, rootMenuItems } from "@/components/navbar/menu";

export type Crumb = {
    label: string;
    /** Absent for a non-clickable crumb (a group label or the current page). */
    href?: string;
};

/** Path part of an href, without its query string. */
export function hrefPath(href: string): string {
    return href.split("?")[0];
}

type MenuEntry = { name: string; href: string; path: string; group?: string };

/**
 * Derive a breadcrumb trail from the current pathname using the sidebar menu as
 * the only source of human names. The deepest menu entry whose path prefixes the
 * pathname anchors the trail; any segments below it are appended as raw crumbs.
 * Root entries carry no group, so their trail is one crumb shorter.
 */
export function getBreadcrumbs(pathname: string): Crumb[] {
    const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    const segments = clean.split("/").filter(Boolean);

    const entries: MenuEntry[] = [
        ...rootMenuItems.map(item => ({ name: item.name, href: item.href, path: hrefPath(item.href) })),
        ...menuList.flatMap(group => group.items.map(item => ({
            name: item.name,
            href: item.href,
            path: hrefPath(item.href),
            group: group.name,
        }))),
    ];

    // Deepest entry whose path is the pathname itself or a prefix of it.
    let best: MenuEntry | null = null;
    for (const entry of entries) {
        if (!entry.path || entry.path === "/") continue;
        if (clean === entry.path || clean.startsWith(entry.path + "/")) {
            if (!best || entry.path.length > best.path.length) best = entry;
        }
    }

    const crumbs: Crumb[] = [{ label: "Home", href: "/" }];

    if (!best) {
        // Nothing in the menu matches: fall back to the raw path segments.
        return [...crumbs, ...segments.map(seg => ({ label: decodeURIComponent(seg) }))];
    }

    if (best.group) crumbs.push({ label: best.group });
    const itemDepth = best.path.split("/").filter(Boolean).length;
    const onItem = clean === best.path;
    crumbs.push({ label: best.name, href: onItem ? undefined : best.href });

    // Any path segments deeper than the matched entry become raw trailing crumbs.
    segments.slice(itemDepth).forEach(seg => {
        crumbs.push({ label: decodeURIComponent(seg) });
    });

    return crumbs;
}
