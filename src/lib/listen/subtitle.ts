export interface Cue {
    index: number;
    start_ms: number; // ms
    end_ms: number; // ms
    text: string[];
    translation: string[];
    active: boolean;
}

const pad = (num: number, size = 2): string => num.toString().padStart(size, "0");

export const validateVttTime = (timeStr: string): RegExpMatchArray | null => {
    return timeStr.match(/^(\d+):(\d{2}):(\d{2})\.(\d{3})$/);
}

export const parseVttTime = (timeStr: string): number => {
    const match = validateVttTime(timeStr);
    if (!match) return 0;
    const [, h, m, s, ms] = match.map(Number);
    return (h * 3600 + m * 60 + s) * 1000 + ms;
}

export const formatVttTime = (time_ms: number): string => {
    const h = Math.floor(time_ms / 3600000);
    const m = Math.floor((time_ms % 3600000) / 60000);
    const s = Math.floor((time_ms % 60000) / 1000);
    const ms = time_ms % 1000;
    return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
};

export function parseVTT(vttText: string, contain_translation: boolean): Cue[] {
    // 去除 BOM 和头部的 "WEBVTT"
    vttText = vttText.replace(/^\uFEFF/, "").trim();
    vttText = vttText.replace(/^WEBVTT[\s\S]*?\n\n/, ""); // 删除 "WEBVTT" header

    const cueBlocks = vttText
        .split(/\n\s*\n/) // 按空行分隔每个 cue
        .map(block => block.trim())
        .filter(Boolean);

    const cues: Cue[] = [];

    for (const block of cueBlocks) {
        const lines = block.split("\n").map(l => l.trim());
        if (lines.length < 2) continue;

        // 时间行格式：00:00:01.000 --> 00:00:04.000
        const timeMatch = lines[0].match(
            /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/
        );
        if (!timeMatch) continue;

        const start = parseVttTime(timeMatch[1]);
        const end = parseVttTime(timeMatch[2]);

        let textLines: string[] = [];
        let translationLines: string[] = [];

        if (contain_translation) {
            // 第一行为 text，其余行为 translation
            if (lines.length > 1) {
                textLines.push(lines[1]);
                translationLines = lines.slice(2);
            }
        } else {
            // 全部都作为 text
            textLines = lines.slice(1);
        }

        cues.push({
            index: cues.length + 1,
            start_ms: start,
            end_ms: end,
            text: textLines,
            translation: translationLines,
            active: false
        });
    }

    return cues;
}

export function parseSRT(srtText: string, contain_translation: boolean = false): Cue[] {
    // 移除 BOM 和空行
    srtText = srtText.replace(/^\uFEFF/, "").trim();

    // 用空行分割每个块
    const blocks = srtText
        .split(/\r?\n\r?\n/)
        .map(block => block.trim())
        .filter(Boolean);

    const parseTime = (timeStr: string): number => {
        const match = timeStr.match(/(\d+):(\d{2}):(\d{2}),(\d{3})/);
        if (!match) return 0;
        const [, h, m, s, ms] = match.map(Number);
        return (h * 3600 + m * 60 + s) * 1000 + ms;
    }

    const cues: Cue[] = [];

    for (const block of blocks) {
        const lines = block.split(/\r?\n/).map(l => l.trim());
        if (lines.length < 2) continue;

        let timeLine = "";
        if (lines[0].includes("-->")) {
            timeLine = lines[0];
        } else if (lines[1]?.includes("-->")) {
            timeLine = lines[1];
            lines.shift(); // 移除 index 行
        } else continue;

        const timeMatch = timeLine.match(
            /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
        );
        if (!timeMatch) continue;

        const start = parseTime(timeMatch[1]);
        const end = parseTime(timeMatch[2]);

        let textLines: string[] = [];
        let translationLines: string[] = [];

        if (contain_translation) {
            if (lines.length > 1) {
                textLines.push(lines[1]);
                translationLines = lines.slice(2);
            }
        } else {
            textLines = lines.slice(1);
        }

        cues.push({
            index: cues.length + 1,
            start_ms: start,
            end_ms: end,
            text: textLines,
            translation: translationLines,
            active: false
        });
    }

    return cues;
}

export function buildVTT(cues: Cue[]): string {
    const header = "WEBVTT\n\n";
    const body = cues
        .map(cue => {
            const start = formatVttTime(cue.start_ms);
            const end = formatVttTime(cue.end_ms);

            // 拼接 text 和 translation
            const lines = [cue.text.join(" "), ...cue.translation];

            return [
                `${start} --> ${end}`,
                ...lines,
                "" // cue 块之间需要空行
            ].join("\n");
        })
        .join("\n");

    return header + body.trim() + "\n";
}

export const mergeCues = (item_list: Cue[]): Cue[] => {
    if (!item_list || item_list.length === 0) return [];

    const firstLine = (lines: string[]): string => lines.length > 0 ? lines[0] : "";
    const lastLine = (lines: string[]): string => lines.length > 0 ? lines[lines.length - 1] : "";

    // 默认合并规则：上一个 cue 末尾以字母/数字/特定符号结尾，当前 cue 开头为字母或数字
    const shouldMerge = (prev: Cue, current: Cue) => {
        const prevLast = lastLine(prev.text);
        const currFirst = firstLine(current.text);
        return prevLast.match(/[a-zA-Z0-9äÄöÖüÜßé,:-]$/) && currFirst.match(/^[0-9a-zA-ZäÄöÖüÜßé]/);
    }

    let mergedList = [...item_list];
    let changed = true;

    // 循环合并，直到没有可合并的 Cue
    while (changed) {
        const newList: Cue[] = [];
        changed = false;

        for (const item of mergedList) {
            const lastItem = newList[newList.length - 1];
            if (lastItem && shouldMerge(lastItem, item)) {
                // 合并 Cue
                lastItem.end_ms = item.end_ms;
                lastItem.text.push(...item.text);
                lastItem.translation.push(...item.translation);
                changed = true;
            } else {
                newList.push({ ...item }); // 拷贝一份，防止修改原对象
            }
        }

        mergedList = newList;
    }

    // 更新 index
    mergedList.forEach((cue, i) => {
        cue.index = i + 1;
    });

    return mergedList;
};
