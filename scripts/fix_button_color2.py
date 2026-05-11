#!/usr/bin/env python3
"""Migrate HeroUI v2 Button color+variant → v3 variant (line-aware)."""

import re
import sys
from pathlib import Path

MAPPING = {
    ("primary",   "solid"):   "primary",
    ("primary",   None):      "primary",
    ("primary",   "flat"):    "tertiary",
    ("primary",   "light"):   "tertiary",
    ("primary",   "bordered"): "secondary",
    ("primary",   "ghost"):   "ghost",
    ("secondary", "solid"):   "secondary",
    ("secondary", None):      "secondary",
    ("secondary", "flat"):    "secondary",
    ("secondary", "light"):   "secondary",
    ("danger",    "solid"):   "danger",
    ("danger",    None):      "danger",
    ("danger",    "flat"):    "danger-soft",
    ("danger",    "light"):   "ghost",
    ("danger",    "bordered"): "danger",
    ("success",   "solid"):   "primary",
    ("success",   None):      "primary",
    ("success",   "light"):   "ghost",
    ("default",   "solid"):   "primary",
    ("default",   None):      "primary",
    ("default",   "flat"):    "ghost",
    ("default",   "light"):   "ghost",
}

# Also rename these standalone variants (no color prop) when inside Button/ButtonGroup
VARIANT_RENAMES = {
    "flat": "ghost",
    "bordered": "outline",
}

# Match color= with single or double quotes
_COLOR = re.compile(r"""\s+color=(?:'([^']*)'|"([^"]*)")""")
# Match variant= with single or double quotes
_VARIANT = re.compile(r"""\s+variant=(?:'([^']*)'|"([^"]*)")""")


def get_val(m):
    return m.group(1) or m.group(2)


def process_line(line: str) -> str:
    # Only touch lines that reference a Button element (has <Button or is inside one)
    color_m = _COLOR.search(line)
    if not color_m:
        # No color; check if we need to rename a standalone variant
        # Only do this if the line has a Button opening tag
        if re.search(r'<Button|<ButtonGroup', line):
            variant_m = _VARIANT.search(line)
            if variant_m:
                v = get_val(variant_m)
                if v in VARIANT_RENAMES:
                    line = _VARIANT.sub(f' variant="{VARIANT_RENAMES[v]}"', line)
        return line

    color = get_val(color_m)
    variant_m = _VARIANT.search(line)
    variant = get_val(variant_m) if variant_m else None

    key = (color, variant)
    new_variant = MAPPING.get(key)
    if new_variant is None:
        print(f"  WARN: no mapping for {key!r}", file=sys.stderr)
        # Just remove color, keep existing variant
        line = _COLOR.sub("", line)
        return line

    # Remove color= from the line
    line = _COLOR.sub("", line)

    # Set variant=
    if variant_m:
        line = _VARIANT.sub(f' variant="{new_variant}"', line)
    else:
        # Insert variant after the Button tag name
        line = re.sub(r'(<(?:Button|ButtonGroup)\b)', rf'\1 variant="{new_variant}"', line, count=1)

    return line


def process_file(path: Path) -> bool:
    src = path.read_text(encoding="utf-8")
    lines = src.splitlines(keepends=True)
    new_lines = [process_line(l) for l in lines]
    result = "".join(new_lines)
    if result == src:
        return False
    path.write_text(result, encoding="utf-8")
    return True


if __name__ == "__main__":
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("src")
    changed = []
    for f in sorted(root.rglob("*.tsx")):
        if "node_modules" in f.parts or ".next" in f.parts:
            continue
        if process_file(f):
            changed.append(f)
            print(f"  fixed: {f}")
    print(f"\nTotal files modified: {len(changed)}")
