import { menuList } from "@/components/navbar/menu";

export type Crumb = {
    label: string;
    /** Absent for a non-clickable crumb (a group label or the current page). */
    href?: string;
};

/** Path part of an href, without its query string. */
export function hrefPath(href: string): string {
    return href.split("?")[0];
}

/**
 * Derive a breadcrumb trail from the current pathname using the sidebar menu as
 * the only source of human names. The deepest menu item whose path prefixes the
 * pathname anchors the trail; any segments below it are appended as raw crumbs.
 */
export function getBreadcrumbs(pathname: string): Crumb[] {
    const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    const segments = clean.split("/").filter(Boolean);

    // Deepest menu item whose path is the pathname itself or a prefix of it.
    let best: { name: string; href: string; group: string; path: string } | null = null;
    for (const group of menuList) {
        for (const item of group.items) {
            if (/^seperator_/.test(item.key)) continue;
            const path = hrefPath(item.href);
            if (!path || path === "/") continue;
            if (clean === path || clean.startsWith(path + "/")) {
                if (!best || path.length > best.path.length) {
                    best = { name: item.name, href: item.href, group: group.name, path };
                }
            }
        }
    }

    const crumbs: Crumb[] = [{ label: "Home", href: "/" }];

    if (!best) {
        // Nothing in the menu matches: fall back to the raw path segments.
        segments.forEach((seg, i) => {
            const isLast = i === segments.length - 1;
            crumbs.push({ label: decodeURIComponent(seg), href: isLast ? undefined : undefined });
        });
        return crumbs;
    }

    crumbs.push({ label: best.group });
    const itemDepth = best.path.split("/").filter(Boolean).length;
    const onItem = clean === best.path;
    crumbs.push({ label: best.name, href: onItem ? undefined : best.href });

    // Any path segments deeper than the matched item become raw trailing crumbs.
    const rest = segments.slice(itemDepth);
    rest.forEach((seg, i) => {
        const isLast = i === rest.length - 1;
        crumbs.push({ label: decodeURIComponent(seg), href: isLast ? undefined : undefined });
    });

    return crumbs;
}
