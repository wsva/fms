import type { IconType } from 'react-icons';
import {
    MdTranslate, MdStar, MdFormatQuote,
    MdHearing, MdGraphicEq, MdRecordVoiceOver, MdMenuBook,
    MdStyle, MdNoteAdd, MdLibraryBooks, MdTune, MdQuiz, MdTrendingUp, MdTableRows,
    MdArticle, MdFeed, MdEditNote, MdPeople,
    MdStorage, MdLabel, MdStorefront, MdCloudQueue,
    MdBuild, MdEventNote, MdInsights, MdPictureAsPdf,
    MdSettings, MdSettingsApplications, MdKey,
} from 'react-icons/md';

export type MenuItem = {
    key: string;
    name: string;
    description: string;
    href: string;
    icon?: IconType;
}

export type MenuGroup = {
    name: string;
    icon: IconType;
    items: MenuItem[];
}

export const menuList: MenuGroup[] = [
    {
        name: "Word",
        icon: MdTranslate,
        items: [
            { key: "word_top", name: "Top Words", description: "top words", href: "/word/top", icon: MdStar },
            { key: "word_sentence", name: "Sentence", description: "search sentences", href: "/word/sentence", icon: MdFormatQuote },
        ],
    },
    {
        name: "Listen & Speak",
        icon: MdHearing,
        items: [
            { key: "seperator_listen", name: "Listen", description: "", href: "" },

            { key: "listen_dictation", name: "Dictation", description: "dictation practice from datasets", href: "/listen/dictation", icon: MdGraphicEq },

            { key: "seperator_speak", name: "Speak", description: "", href: "" },
            { key: "speak_practice", name: "Practice", description: "practice", href: "/speak/practice", icon: MdRecordVoiceOver },

            { key: "seperator_read", name: "Read", description: "", href: "" },
            { key: "read_book_main", name: "Reading", description: "read a book from datasets", href: "/speak/read", icon: MdMenuBook },
        ],
    },
    {
        name: "Card",
        icon: MdStyle,
        items: [
            { key: "card_add", name: "Add Card", description: "add new card", href: "/card/add?edit=y", icon: MdNoteAdd },
            { key: "card_my", name: "My Cards", description: "my cards", href: "/card/my", icon: MdLibraryBooks },
            { key: "card_manage", name: "Manage Cards", description: "manage cards", href: "/card/manage", icon: MdTune },
            { key: "card_test", name: "Card Test", description: "learn cards", href: "/card/test", icon: MdQuiz },
            { key: "card_improve", name: "Improve Cards", description: "review AI-suggested improvements", href: "/card/improve", icon: MdTrendingUp },
            { key: "card_table", name: "Card Table", description: "all cards in a table view", href: "/card/table", icon: MdTableRows },
        ],
    },
    {
        name: "Blog",
        icon: MdArticle,
        items: [
            { key: "blog_index", name: "Blog", description: "all blogs", href: "/blog", icon: MdFeed },
            { key: "blog_add", name: "Add Blog", description: "add new blog", href: "/blog/add", icon: MdEditNote },
            { key: "blog_all_of_others", name: "View Blogs By Others", description: "blogs by others", href: "/blog/all_of_others", icon: MdPeople },
        ],
    },
    {
        name: "Dataset",
        icon: MdStorage,
        items: [
            { key: "dataset_tag", name: "Tags", description: "manage tags for all features", href: "/dataset/tag", icon: MdLabel },
            { key: "dataset_market", name: "Market", description: "datasets shared by others", href: "/dataset/market", icon: MdStorefront },
            { key: "dataset_manage", name: "My Datasets", description: "visibility, tags and deletion", href: "/dataset/manage", icon: MdCloudQueue },
        ],
    },
    {
        name: "Tools",
        icon: MdBuild,
        items: [
            { key: "plan_main", name: "Plan", description: "make plans", href: "/plan", icon: MdEventNote },
            { key: "tools_stats", name: "Learning Stats", description: "XP, progress and practice history", href: "/stats", icon: MdInsights },
            { key: "tools_pdf_reader", name: "PDF Reader", description: "PDF reader", href: "/tools/pdf_reader", icon: MdPictureAsPdf },
        ],
    },
    {
        name: "Settings",
        icon: MdSettings,
        items: [
            { key: "settings_general", name: "General", description: "General settings", href: "/settings/general", icon: MdSettingsApplications },
            { key: "settings_api", name: "API", description: "view APIs", href: "/settings/api", icon: MdKey },
        ],
    },
];
