import { qsa_card, qsa_card_review } from "@prisma/client";
import { ZodIssue } from "zod";

type ActionResult<T> = {
    status: "success",
    data: T,
    total_records?: number,
    page?: number,
    total_pages?: number,
} | {
    status: "error",
    error: string | ZodIssue[],
}

type topword = {
    id: number;
    word: string;
    in_dict: string;
    in_card: string;
}

type card_ext = Partial<qsa_card> & {
    tag_list_added?: string[];
    tag_list_new?: string[];
    tag_list_remove?: string[];
    tag_list_suggestion?: string[];
}

type card_review = qsa_card_review & {
    card: qsa_card;
}

type read_sentence_browser = {
    uuid: string;
    chapter_uuid: string;
    order_num: number;
    original: string;
    recognized: string;
    audioBlob?: Blob;
    audio_path?: string;
    created_at?: Date;
    modified_db: boolean;
    modified_fs: boolean;
}

type audio = {
    url?: string; // audio data in object url format, URL.createObjectURL(audioBlob)
    path?: string; // audio file on disk and can be accessed by http(s)
    created_by: string;
    created_at: Date;
    updated_at: Date;
}

type Action =
    | { action_type: "router", href: string } // open new page
    | { action_type: "click", elementId: string } // click a button on the page
    | { action_type: "function", name: string } // call a function
    | { action_type: "keydown", event: KeyboardEventInit } // press key
    | { action_type: "invalid", info: string };