import { marked } from "marked";
import { TOC } from "./toc";

// Set options
marked.use({
    pedantic: false,
    breaks: true,
    gfm: true,
});

export function tableRemoveEmptyThead(body: string[]): string[] {
    return body.map(html => {
        // 全局替换所有 thead 块（不区分大小写、跨行匹配）
        return html.replace(/<thead\b[^>]*>[\s\S]*?<\/thead>/gi, (theadBlock) => {
            // 找到所有 <th>...</th>（不区分大小写）
            const thMatches = theadBlock.match(/<th\b[^>]*>[\s\S]*?<\/th>/gi);

            // 如果没有 th 元素，认为 thead 内容为空，删掉整个 thead
            if (!thMatches || thMatches.length === 0) {
                return "";
            }

            // 辅助：将 HTML 实体 &nbsp; 转为空格，便于 trim 判断
            const decodeNbsp = (s: string) => s.replace(/&nbsp;/gi, " ");

            // 对每个 th 做内容检测：去掉 HTML 标签，替换实体并 trim
            for (const th of thMatches) {
                // 去掉所有标签，剩下文本内容
                const inner = decodeNbsp(th.replace(/<[^>]+>/g, "")).trim();

                // 如果存在非空文本，则保留整个 theadBlock（不删除）
                if (inner !== "") {
                    return theadBlock;
                }
            }

            // 所有 th 都是空的（或只有标签/空白/nbsp）→ 删除 thead
            return "";
        });
    });
}


export function toHTML(content: string) {
    const toc = new TOC();
    let body: string[] = [];
    let buffer = "";

    const lines = content.replace(/\r/g, "").split("\n");
    const regHead = /^(#+)\s+(.*)$/;

    let inCodeBlock = false;

    for (const line of lines) {

        // ----------------------------------------
        // 1. 检测代码块 ``` 开始 / 结束
        // ----------------------------------------
        if (line.trim().startsWith("`````")) {
            inCodeBlock = !inCodeBlock;  // 进入或退出代码块
            buffer += line + "\n";
            continue;
        }

        // ----------------------------------------
        // 2. 若在代码块中 → 不解析 heading，直接写入 buffer
        // ----------------------------------------
        if (inCodeBlock) {
            buffer += line + "\n";
            continue;
        }

        // ----------------------------------------
        // 3. 处理 Markdown heading
        // ----------------------------------------
        if (regHead.test(line)) {
            // flush previous paragraph
            if (buffer !== "") {
                body.push(marked.parse(buffer) as string);
                buffer = "";
            }

            const [, hashes, title] = line.match(regHead)!;
            const depth = hashes.length;

            const sec = toc.newSection(depth);
            toc.add(title, sec, false);

            body.push(`
<h${depth + 1} id="sec-${sec.toString()}">
  <span class="section-number-${depth + 1}">${sec.toString()}</span>
  ${title}
</h${depth + 1}>`);
        } else {
            buffer += line + "\n";
        }
    }

    if (buffer !== "") body.push(marked.parse(buffer) as string);

    // 清理空 thead
    body = tableRemoveEmptyThead(body);

    return {
        toc: toc.html(),
        body: body.join("\n"),
    };
}
