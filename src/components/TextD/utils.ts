const ColorList: string[] = ["lightcoral", "lightgreen", "lightseagreen",
    "lightpink", "goldenrod", "lightskyblue", "lightyellow",
    "cadetblue", "coral", "darkkhaki", "darkorchid", "darkgreen", "thistle"];

/**
 * 如果是人物对话，就把人名高亮
 * 应该在coverText()前面被调用
 */
export const highlightName = (text: string) => {
    if (!text) {
        return "";
    }

    let newtext = "";
    const colorMap = new Map<string, string>();
    let colorIndex = 0;
    text.split("\n").forEach((line, index, arr) => {
        if (index < arr.length - 1) {
            line += "\n";
        }
        const name = parseName(line);
        if (name == "") {
            newtext += line;
            return
        }
        let color = colorMap.get(name) || "";
        if (color == "") {
            color = ColorList[colorIndex];
            colorMap.set(name, color);
            colorIndex = (colorIndex + 1) % ColorList.length;
        }
        //添加标签
        //replace函数默认只替换一次，正好满足我们的需要
        //设置为90%大小，是为了不遮挡其他文字的下划线(使用border制作的下划线)
        const newline = line.replace(name,
            `<span style="font-size: 90%;background-color: ${color};">${name}</span>`);
        newtext += newline;
    })
    return newtext;
}


/**
 * 解析人名，特征是：
 * 1，人名在行开头；
 * 2，人名不能超过3个空格；
 * 3，人名后面有个英文冒号，冒号后面有个空格。
 */
export const parseName = (line: string) => {
    //?表示最短匹配
    //人名可能包含法语特殊字符，没办法列举
    const mlist = line.match(/^([^:]+): /);
    //匹配不到的不处理
    if (mlist != null) {
        const name = mlist[1];
        //多于3个空格的不算人名
        const space = name.match(/ /g);
        if (space == null || space.length < 4) {
            return name;
        }
    }
    return "";
}



/**
 * coverText(0)只会将文本设置为highlight过的文本，不会执行覆盖
 * 大于等于length长度的单词会被覆盖。若length为0，不进行覆盖
 */
export const coverText = (text: string, length: number) => {
    if (!text) {
        return "";
    }

    if (length < 1) {
        return text;
    }
    const lineList = text.split("\n");
    lineList.forEach((line, i) => {
        if (line.indexOf("</span>:") >= 0) {
            const pos = line.lastIndexOf("</span>:")
            lineList[i] = line.substring(0, pos + "</span>: ".length)
                + coverLine(line.substring(pos + "</span>: ".length), length);
        } else {
            lineList[i] = coverLine(line, length);
        }
    });
    return lineList.join("\n");
}

/**
 * 大于等于length长度的单词会被覆盖。若length为0，不进行覆盖
 */
export const coverLine = (line: string, length: number) => {
    if (length < 1) {
        return line;
    }
    let odd = false;
    const replacer = function (m: string): string {
        odd = !odd;
        return odd ? `<span class="cover odd">${m}</span>`
            : `<span class="cover">${m}</span>`;
    }
    return line
        .replace(RegExp(`\\d*[a-zA-ZäÄüÜöÖßéœ-]{${length},}`, "g"), replacer)
        .replace(/\d+ Uhr \d+/g, replacer)
        .replace(/\d[\d\s\.,/:]*\d/g, replacer)
        .replace(/\d+/g, replacer);
}

export const unescape = (str: string) => {
    const arrEntities: Map<string, string> = new Map([
        ['lt', '<'],
        ['gt', '>'],
        ['nbsp', ' '],
        ['amp', '&'],
        ['quot', '"'],
    ]);
    return str.replace(/&(lt|gt|nbsp|amp|quot);/ig,
        (_, t) => { return arrEntities.get(t) || ""; });
}