#!/usr/bin/env python3
"""Replace <Pagination> v2 with <SimplePagination> v3."""
import re, sys
from pathlib import Path

PAGINATION_IMPORT = re.compile(r'\bPagination\b', re.DOTALL)

def process(path: Path) -> bool:
    src = path.read_text()

    # Find any multi-line <Pagination ...props... /> that have total=, page=, onChange=
    # We want to capture each Pagination tag block
    # Strategy: find lines with <Pagination and match until />
    lines = src.split('\n')
    out_lines = []
    i = 0
    modified = False

    while i < len(lines):
        line = lines[i]
        if re.search(r'<Pagination\b', line) and 'SimplePagination' not in line:
            # Collect the tag block
            tag_lines = [line]
            j = i + 1
            # find closing />
            while j < len(lines) and '/>' not in ''.join(tag_lines):
                tag_lines.append(lines[j])
                j += 1
            tag = '\n'.join(tag_lines)

            # Extract props
            total_m = re.search(r'total=\{([^}]+)\}', tag)
            page_m = re.search(r'page=\{([^}]+)\}', tag)
            onchange_m = re.search(r'onChange=(\{[^}]+\})', tag)

            if total_m and page_m and onchange_m:
                total = total_m.group(1)
                page = page_m.group(1)
                onchange_raw = onchange_m.group(1)  # includes the braces

                # Determine indentation from first line
                indent = len(line) - len(line.lstrip())
                pad = ' ' * indent

                new_tag = f'{pad}<SimplePagination total={{{total}}} page={{{page}}} onChange={onchange_raw} />'
                out_lines.append(new_tag)
                modified = True
                i = j
            else:
                out_lines.extend(tag_lines)
                i = j
        else:
            out_lines.append(line)
            i += 1

    if not modified:
        return False

    result = '\n'.join(out_lines)

    # Fix imports: remove Pagination from @heroui/react, add SimplePagination
    # Remove Pagination from @heroui/react imports
    def remove_pagination_from_import(m):
        before = m.group(0)
        new = re.sub(r',?\s*\bPagination\b\s*,?', lambda x: ',' if x.group(0).count(',') == 2 else '', before)
        # Clean up double commas
        new = re.sub(r',\s*,', ',', new)
        new = re.sub(r'\{\s*,', '{', new)
        new = re.sub(r',\s*\}', '}', new)
        return new

    # Remove Pagination from the @heroui/react import line
    result = re.sub(
        r'import \{[^}]+\} from "@heroui/react";',
        lambda m: re.sub(r',?\s*\bPagination\b', '', m.group(0)),
        result
    )

    # Add SimplePagination import if not already there
    if 'SimplePagination' not in result:
        # Add after 'use client' or at top
        result = re.sub(
            r"(import .+ from \"@heroui/react\";)",
            r"\1\nimport SimplePagination from '@/components/SimplePagination';",
            result,
            count=1
        )

    path.write_text(result)
    return True

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('src')
for f in sorted(root.rglob('*.tsx')):
    if 'node_modules' in f.parts or '.next' in f.parts:
        continue
    if process(f):
        print(f'  fixed: {f}')
