export class TOCSectionNumber {
    n: number[];

    constructor(section: number[]) {
        this.n = section;
    }

    static new(section: number[]) {
        return new TOCSectionNumber(section);
    }

    copy() {
        return new TOCSectionNumber([...this.n]);
    }

    toString() {
        return this.n.join(".");
    }

    depth() {
        return this.n.length;
    }

    firstChild() {
        return new TOCSectionNumber([...this.n, 1]);
    }

    next() {
        const arr = [...this.n];
        arr[arr.length - 1] += 1;
        return new TOCSectionNumber(arr);
    }
}

export class TOCItem {
    title: string;
    section: TOCSectionNumber;
    virtual: boolean;

    constructor(title: string, section: TOCSectionNumber, virtual: boolean) {
        this.title = title;
        this.section = section;
        this.virtual = virtual;
    }

    depth() {
        return this.section.depth();
    }

    html() {
        if (this.virtual) return "";
        return `<a href="#sec-${this.section.toString()}">${this.section.toString()} ${this.title}</a>`;
    }
}

class TOCTreeNode {
    self: TOCItem;
    children: TOCTreeNode[] = [];

    constructor(item: TOCItem) {
        this.self = item;
    }

    html(): string[] {
        const out: string[] = [];
        out.push("<li>");
        out.push(this.self.html());
        if (this.children.length > 0) {
            out.push("<ul>");
            for (const c of this.children) {
                out.push(...c.html());
            }
            out.push("</ul>");
        }
        out.push("</li>");
        return out;
    }
}

class TOCTree {
    children: TOCTreeNode[] = [];

    add(item: TOCItem) {
        if (item.depth() === 1) {
            this.children.push(new TOCTreeNode(item));
            return;
        }
        const parent = this.findParent(item.section.n);
        parent.children.push(new TOCTreeNode(item));
    }

    findParent(section: number[]): TOCTreeNode {
        let p = this.children[section[0] - 1];
        for (let i = 1; i < section.length - 1; i++) {
            p = p.children[section[i] - 1];
        }
        return p;
    }

    html(): string[] {
        if (this.children.length === 0) return [];

        const out: string[] = [];
        out.push("<ul>");
        for (const c of this.children) out.push(...c.html());
        out.push("</ul>");
        return out;
    }
}

export class TOC {
    list: TOCItem[] = [];

    add(title: string, s: TOCSectionNumber, virtual: boolean) {
        this.list.push(new TOCItem(title, s, virtual));
    }

    newSection(depth: number): TOCSectionNumber {
        // First section case
        if (this.list.length === 0) {
            let s = TOCSectionNumber.new([1]);
            for (let i = 1; i < depth; i++) {
                this.add("virtual", s, true);
                s = s.firstChild();
            }
            return s;
        }

        // find previous section with <= depth
        let last = this.list[this.list.length - 1];
        for (let i = this.list.length - 1; i >= 0; i--) {
            if (this.list[i].depth() <= depth) {
                last = this.list[i];
                break;
            }
        }

        if (last.depth() === depth) {
            return last.section.next();
        }

        // missing levels → fill
        let s = last.section;
        for (let i = 1; i < depth - last.depth(); i++) {
            s = s.firstChild();
            this.add("virtual", s, true);
        }
        return s.firstChild();
    }

    html(): string {
        const tree = new TOCTree();
        if (this.list.length === 0) return "";
        
        for (const item of this.list) tree.add(item);

        return `
<div id="table-of-contents">
<h2>Table of Contents</h2>
<div id="text-table-of-contents">
${tree.html().join("\n")}
</div>
</div>`;
    }
}
