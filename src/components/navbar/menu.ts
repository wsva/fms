type MenuItem = {
    key: string;
    name: string;
    description: string;
    href: string;
}

type MenuGroup = {
    name: string;
    items: MenuItem[];
}

export const menuList: MenuGroup[] = [
    {
        name: "Plan",
        items: [
            { key: "plan_main", name: "My Plans", description: "set and view plans", href: "/plan" },
        ],
    },
    {
        name: "Word",
        items: [
            { key: "word_top", name: "Top Words", description: "top words", href: "/word/top" },
            { key: "word_sentence", name: "Sentence", description: "search sentences", href: "/word/sentence" },
        ],
    },
    {
        name: "Listen",
        items: [
            { key: "listen_tag", name: "Manage Tags", description: "manage tags", href: "/listen/tag" },
            { key: "listen_dictation", name: "Dictation", description: "dictation", href: "/listen/dictation" },
            { key: "listen_media", name: "My Media", description: "my media", href: "/listen/media" },
        ],
    },
    {
        name: "Speak",
        items: [
            { key: "speak_just_speaking", name: "Just Speaking", description: "record and upload audio", href: "/speak/just-speaking" },
            { key: "speak_practice", name: "Practice", description: "practice", href: "/speak/practice" },
            { key: "speak_ask", name: "Asking", description: "ask or answer a question", href: "/speak/ask" },
            { key: "read_book_main", name: "Reading", description: "read a book", href: "/speak/read" },
            { key: "read_book_manage", name: "Manage Books", description: "manage books and chapters", href: "/speak/read/book" },
            { key: "read_book_text", name: "View Book Text", description: "show content in pure text", href: "/speak/read/text" },
        ],
    },
    {
        name: "Blog",
        items: [
            { key: "blog_index", name: "Blog", description: "all blogs", href: "/blog" },
            { key: "blog_add", name: "Add Blog", description: "add new blog", href: "/blog/add" },
            { key: "blog_all_of_others", name: "View Blogs By Others", description: "blogs by others", href: "/blog/all_of_others" },
        ],
    },
    {
        name: "Card",
        items: [
            { key: "card_tag", name: "Manage Tags", description: "manage tags", href: "/card/tag" },
            { key: "card_add", name: "Add Card", description: "add new card", href: "/card/add?edit=y" },
            { key: "card_my", name: "My Cards", description: "my cards", href: "/card/my" },
            { key: "card_manage", name: "Manage Cards", description: "manage cards", href: "/card/manage" },
            { key: "card_test", name: "Card Test", description: "learn cards", href: "/card/test" },
        ],
    },
    {
        name: "Settings",
        items: [
            { key: "settings_api", name: "API", description: "view APIs", href: "/settings/api" },
            { key: "settings_api_key", name: "API Key", description: "manage API key", href: "/settings/api-key" },
        ],
    },
];