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
        name: "Word",
        items: [
            { key: "word_top", name: "Top Words", description: "top words", href: "/word/top" },
            { key: "word_sentence", name: "Sentence", description: "search sentences", href: "/word/sentence" },
        ],
    },
    {
        name: "Listen",
        items: [
            { key: "listen_dictation", name: "dictation", description: "dictation", href: "/listen/dictation" },
        ],
    },
    {
        name: "Speak",
        items: [
            { key: "speak_read", name: "reading", description: "read a book", href: "/speak/read" },
            { key: "speak_ask", name: "asking", description: "ask or answer a question", href: "/speak/ask" },
            { key: "speak_torsten_voice", name: "Torsten Voice", description: "Torsten Voice", href: "/speak/torsten_voice" },
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
            { key: "card_market", name: "Card Market", description: "cards by others", href: "/card/market" },
            { key: "card_test", name: "Card Test", description: "learn cards", href: "/card/test" },
        ],
    },
];