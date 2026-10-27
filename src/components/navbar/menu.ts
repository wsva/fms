import type { ComponentType } from 'react';
import {
    Headphones, BookOpen, Layers, BookOpenText,
    Newspaper, FileText, SquarePen, Users,
    Store, Cloud,
    Wrench, CalendarDays, ChartColumn, FileType,
    Settings,
} from 'lucide-react';
import MicGlyph from '@/components/design/MicGlyph';

/**
 * lucide icons plus the app's MicGlyph wrapper, which is a plain function
 * component rather than a LucideIcon and so cannot share its type.
 */
export type MenuIcon = ComponentType<{ size?: number; className?: string }>;

export type MenuItem = {
    key: string;
    name: string;
    description: string;
    href: string;
    icon: MenuIcon;
}

export type MenuGroup = {
    name: string;
    icon: MenuIcon;
    items: MenuItem[];
}

/**
 * Top-level entries, rendered above the groups and reachable in one click.
 * Mirrors fms-app's rootTabs (Sidebar.tsx:89-96), down to the icons: the first
 * five are the ones the app uses for the same five tabs; Settings is appended as
 * a single page entry (its sub-menu was dropped in favor of the in-page
 * SettingsNav). /cards is the only
 * card surface — the old pre-dataset pages under /card/* were removed.
 */
export const rootMenuItems: MenuItem[] = [
    { key: "listen_dictation", name: "Dictation", description: "dictation practice from datasets", href: "/listen/dictation", icon: Headphones },
    // Named for the app's `books` tab. The URL stays /speak/read: it is public
    // and there is no redirect layer to carry old links.
    { key: "books_main", name: "Books", description: "read book datasets sentence by sentence", href: "/speak/read", icon: BookOpen },
    { key: "speak_practice", name: "Read Aloud", description: "record yourself reading a text", href: "/speak/practice", icon: MicGlyph },
    { key: "cards", name: "Cards", description: "browse and review dataset cards", href: "/cards", icon: Layers },
    { key: "wiki", name: "Wiki", description: "browse, search and edit wiki datasets", href: "/wiki", icon: BookOpenText },
    // Single entry: the in-page SettingsNav sections replace the old sub-menu.
    { key: "settings", name: "Settings", description: "app settings", href: "/settings", icon: Settings },
];

export const menuList: MenuGroup[] = [
    {
        name: "Blog",
        icon: Newspaper,
        items: [
            { key: "blog_index", name: "Blog", description: "all blogs", href: "/blog", icon: FileText },
            { key: "blog_add", name: "Add Blog", description: "add new blog", href: "/blog/add", icon: SquarePen },
            { key: "blog_all_of_others", name: "View Blogs By Others", description: "blogs by others", href: "/blog/all_of_others", icon: Users },
        ],
    },
    {
        name: "Tools",
        icon: Wrench,
        items: [
            { key: "plan_main", name: "Plan", description: "make plans", href: "/plan", icon: CalendarDays },
            { key: "tools_stats", name: "Learning Stats", description: "XP, progress and practice history", href: "/stats", icon: ChartColumn },
            { key: "tools_pdf_reader", name: "PDF Reader", description: "PDF reader", href: "/tools/pdf_reader", icon: FileType },
            // Absorbed from the removed Dataset group.
            { key: "dataset_market", name: "Datasets Market", description: "datasets shared by others", href: "/dataset/market", icon: Store },
            { key: "dataset_manage", name: "My Datasets", description: "visibility, tags and deletion", href: "/dataset/manage", icon: Cloud },
        ],
    },
];
