/*
const typeOptions = [
    { "router": "open new page" },
    { "click": "click a button on the page" },
    { "function": "call a function" },
    { "keydown": "press key" },
];*/

export const typeOptions = new Map<string, string>([
    ["router", "open new page"],
    ["click", "click a button on the page"],
    ["function", "call a function"],
    ["keydown", "press key"],
]);