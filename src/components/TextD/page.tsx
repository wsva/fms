/**
 * cover text for dictation
 */

import React from 'react';
import { coverText, highlightName } from './utils';
import './style.css';

interface Props {
    content?: string;
    language?: string;
    highlight?: boolean;
    cover?: boolean;
    coverLength?: number;
}

export default function TextD(props: Props) {
    const {
        content = "",
        language = "",
        highlight = false,
        cover = false,
        coverLength = 1,
    } = props;

    const getHtml = (content: string) => {
        let result = content;
        if (highlight) {
            result = highlightName(result);
        }
        if (cover) {
            result = coverText(result, coverLength);
        }
        return result;
    }

    return (
        <pre className='cover-text-pre'>
            <code className='cover-text-code' lang={language}
                dangerouslySetInnerHTML={{ __html: getHtml(content) }}
            />
        </pre>
    );
}