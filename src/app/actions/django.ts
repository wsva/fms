'use server';

import { ActionResult } from "@/lib/types";
import wretch from "wretch";

const api = wretch('http://als-django:8000').accept("application/json")

export const punctuate = (text: string) => {
    return api.post({ text }, "/punctuation/");
}

export const splitText = (text: string, language: string) => {
    return api.post({ text, language }, "/nlp/spacy/text/");
}

export const splitSentence = async (sentence: string, language: string) => {
    const response = await fetch(`http://als-django:8000/nlp/spacy/sentence/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sentence, language }),
    });
    const result = await response.json();
    return result as ActionResult<string[]>;
}

export const splitSentence2 = async (sentence: string, language: string) => {
    return api.post({ sentence, language }, "/nlp/spacy/sentence/");
}