import type { ComponentType } from 'react';
import {
    Headphones, BookOpen, Layers, BookOpenText,
    Languages, Star, Quote,
    SquareStack, FilePlus, Library, SlidersHorizontal, GraduationCap, TrendingUp, Table,
    Newspaper, FileText, SquarePen, Users,
    Database, Tag, Store, Cloud,
    Wrench, CalendarDays, ChartColumn, FileType,
    Settings, Settings2, KeyRound,
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
 * five are the ones the app uses for the same five tabs. The card pages
 * under /card/* are the old pre-dataset system, distinct from the
 * dataset-based /cards.
 */
export const rootMenuItems: MenuItem[] = [
    { key: "listen_dictation", name: "Dictation", description: "dictation practice from datasets", href: "/listen/dictation", icon: Headphones },
    { key: "read_book_main", name: "Read a Book", description: "read a book from datasets", href: "/speak/read", icon: BookOpen },
    { key: "speak_practice", name: "Read Aloud", description: "record yourself reading a text", href: "/speak/practice", icon: MicGlyph },
    { key: "cards", name: "Cards", description: "browse and review dataset cards", href: "/cards", icon: Layers },
    { key: "wiki", name: "Wiki", description: "browse, search and edit wiki datasets", href: "/wiki", icon: BookOpenText },
];

export const menuList: MenuGroup[] = [
    {
        name: "Word",
        icon: Languages,
        items: [
            { key: "word_top", name: "Top Words", description: "top words", href: "/word/top", icon: Star },
            { key: "word_sentence", name: "Sentence", description: "search sentences", href: "/word/sentence", icon: Quote },
        ],
    },
    {
        name: "Card",
        icon: SquareStack,
        items: [
            { key: "card_add", name: "Add Card", description: "add new card", href: "/card/add?edit=y", icon: FilePlus },
            { key: "card_my", name: "My Cards", description: "my cards", href: "/card/my", icon: Library },
            { key: "card_manage", name: "Manage Cards", description: "manage cards", href: "/card/manage", icon: SlidersHorizontal },
            { key: "card_test", name: "Card Test", description: "learn cards", href: "/card/test", icon: GraduationCap },
            { key: "card_improve", name: "Improve Cards", description: "review AI-suggested improvements", href: "/card/improve", icon: TrendingUp },
            { key: "card_table", name: "Card Table", description: "all cards in a table view", href: "/card/table", icon: Table },
        ],
    },
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
        name: "Dataset",
        icon: Database,
        items: [
            { key: "dataset_tag", name: "Tags", description: "manage tags for all features", href: "/dataset/tag", icon: Tag },
            { key: "dataset_market", name: "Market", description: "datasets shared by others", href: "/dataset/market", icon: Store },
            { key: "dataset_manage", name: "My Datasets", description: "visibility, tags and deletion", href: "/dataset/manage", icon: Cloud },
        ],
    },
    {
        name: "Tools",
        icon: Wrench,
        items: [
            { key: "plan_main", name: "Plan", description: "make plans", href: "/plan", icon: CalendarDays },
            { key: "tools_stats", name: "Learning Stats", description: "XP, progress and practice history", href: "/stats", icon: ChartColumn },
            { key: "tools_pdf_reader", name: "PDF Reader", description: "PDF reader", href: "/tools/pdf_reader", icon: FileType },
        ],
    },
    // Last on purpose: the app renders Settings at the bottom of the nav.
    {
        name: "Settings",
        icon: Settings,
        items: [
            { key: "settings_general", name: "General", description: "General settings", href: "/settings/general", icon: Settings2 },
            { key: "settings_api", name: "API", description: "view APIs", href: "/settings/api", icon: KeyRound },
        ],
    },
];
