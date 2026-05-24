"use client"

import { useEffect, useState, type ReactNode } from "react";
import { toHTML } from "./html";
import './markdown.css';
import './katex.min.css';

type Props = {
    src?: string;
    content?: string;
    withTOC?: boolean;
}

export default function Page({ src, content, withTOC = false }: Props) {
    const [stateContent, setStateContent] = useState<string>(content || "");
    const [stateTOC, setStateTOC] = useState<ReactNode>(null);
    const [stateBody, setStateBody] = useState<ReactNode[]>([]);

    useEffect(() => {
        if (content !== undefined) setStateContent(content);
    }, [content]);

    useEffect(() => {
        if (!!src) {
            fetch(src)
                .then(res => res.text())
                .then(md => setStateContent(md))
                .catch(err => console.error(err));
        }
    }, [src]);

    useEffect(() => {
        const { toc, body } = toHTML(stateContent);
        setStateTOC(toc);
        setStateBody(body);
    }, [stateContent]);

    return (
        <div className="md-container">
            {(withTOC && !!stateTOC) && stateTOC}
            <article className="md-body">
                {stateBody}
            </article>
        </div>
    );
}
