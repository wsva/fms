#!/usr/bin/env python3
"""Remove v2-only props from Input and TextArea elements line by line."""
import re, sys
from pathlib import Path

# Props to remove from Input/TextArea on the same line as the tag
REMOVE_PROPS = [
    r'\s+isClearable\b',
    r'''\s+radius=(?:'[^']*'|"[^"]*")''',
    r'''\s+onClear=\{[^}]+\}''',
    r'''\s+classNames=\{[^}]+\}''',  # simple single-object classNames (may not catch all)
]

# For size= on Input/TextArea - this clashes with HTML size attr (expects number)
# Replace size='sm'|"sm"|'lg'|"lg"|'md'|"md" with nothing (use Tailwind)
SIZE_PAT = re.compile(r'''\s+size=(?:'(?:sm|md|lg|xl)'|"(?:sm|md|lg|xl)")''')

def process_line(line: str) -> str:
    # Only touch lines that reference an Input/TextArea element
    if not re.search(r'<(?:Input|TextArea)\b', line):
        return line

    for pat in REMOVE_PROPS:
        line = re.sub(pat, '', line)

    line = SIZE_PAT.sub('', line)

    return line


def process_file(path: Path) -> bool:
    src = path.read_text(encoding='utf-8')
    lines = src.splitlines(keepends=True)
    new_lines = [process_line(l) for l in lines]
    result = ''.join(new_lines)
    if result == src:
        return False
    path.write_text(result, encoding='utf-8')
    return True


if __name__ == '__main__':
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('src')
    for f in sorted(root.rglob('*.tsx')):
        if 'node_modules' in f.parts or '.next' in f.parts:
            continue
        if process_file(f):
            print(f'  fixed: {f}')
