"use client"

import React, { useEffect, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
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
    const [stateTOC, setStateTOC] = useState<string>("");
    const [stateBody, setStateBody] = useState<string>("");

    useEffect(() => {
        if (!!src) {
            fetch(src)
                .then(res => res.text())
                .then(md => setStateContent(md))
                .catch(err => console.error(err));
        }
    }, [src]);

    useEffect(() => {
        const html = toHTML(stateContent);
        setStateTOC(html.toc);
        setStateBody(html.body);
    }, [stateContent]);

    return (
        <div className="md-container">
            {withTOC && !!stateTOC && (
                <aside
                    className="md-toc"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(stateTOC) }}
                />
            )}

            <article
                className="md-body"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(stateBody) }}
            />
        </div>
    );
};