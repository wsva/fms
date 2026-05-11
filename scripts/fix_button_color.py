#!/usr/bin/env python3
"""Migrate HeroUI v2 Button color+variant → v3 variant."""

import re
import sys
from pathlib import Path

# v2 (color, variant) → v3 variant
# variant=None means the variant attribute is absent (default was "solid")
MAPPING = {
    ("primary", "solid"):   "primary",
    ("primary", None):      "primary",
    ("primary", "flat"):    "tertiary",
    ("primary", "light"):   "tertiary",
    ("primary", "bordered"): "secondary",
    ("primary", "ghost"):   "ghost",
    ("secondary", "solid"): "secondary",
    ("secondary", None):    "secondary",
    ("secondary", "flat"):  "secondary",
    ("secondary", "light"): "secondary",
    ("danger", "solid"):    "danger",
    ("danger", None):       "danger",
    ("danger", "flat"):     "danger-soft",
    ("danger", "light"):    "ghost",
    ("success", "solid"):   "primary",
    ("success", "light"):   "ghost",
    ("default", "solid"):   "primary",
    ("default", "flat"):    "ghost",
    ("default", "light"):   "ghost",
}

# Also: standalone variant changes (no color, but v2 variant names)
VARIANT_ONLY = {
    "flat":     "ghost",
    "bordered": "outline",
    # "light" and "solid" may or may not still work; leave them for now
}

_ATTR = r"""(?:(?:'[^']*')|(?:"[^"]*")|(?:\{[^}]*\})|[^\s>/'"])"""
_OPEN_TAG = re.compile(
    r'(<(?:Button|ButtonGroup)\b(?:\s+(?:[a-zA-Z_:][a-zA-Z0-9_.:-]*(?:\s*=\s*' + _ATTR + r')?))*\s*/?>)',
    re.DOTALL,
)

_COLOR_ATTR   = re.compile(r'''\s+color=(?:'([^']*)'|"([^"]*)")''')
_VARIANT_ATTR = re.compile(r'''\s+variant=(?:'([^']*)'|"([^"]*)")''')


def get_attr(m):
    return m.group(1) or m.group(2)


def process_tag(tag: str) -> str:
    color_m   = _COLOR_ATTR.search(tag)
    variant_m = _VARIANT_ATTR.search(tag)

    if not color_m:
        # No color prop — check if variant alone needs renaming
        if variant_m:
            v = get_attr(variant_m)
            if v in VARIANT_ONLY:
                tag = _VARIANT_ATTR.sub(
                    lambda _: f' variant="{VARIANT_ONLY[v]}"', tag
                )
        return tag

    color   = get_attr(color_m)
    variant = get_attr(variant_m) if variant_m else None

    key = (color, variant)
    new_variant = MAPPING.get(key)
    if new_variant is None:
        # Try with variant normalised
        new_variant = MAPPING.get((color, None), f"primary")
        print(f"  WARN: unknown mapping {key!r} → defaulting to {new_variant!r}", file=sys.stderr)

    # Remove color= attribute
    tag = _COLOR_ATTR.sub("", tag)

    # Set/replace variant= attribute
    if variant_m:
        tag = _VARIANT_ATTR.sub(f' variant="{new_variant}"', tag)
    else:
        # Insert variant= after the component name
        tag = re.sub(r'(<(?:Button|ButtonGroup)\b)', rf'\1 variant="{new_variant}"', tag, count=1)

    return tag


def process_file(path: Path) -> bool:
    src = path.read_text(encoding="utf-8")
    result = _OPEN_TAG.sub(lambda m: process_tag(m.group(0)), src)
    if result == src:
        return False
    path.write_text(result, encoding="utf-8")
    return True


if __name__ == "__main__":
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("src")
    changed = []
    for f in root.rglob("*.tsx"):
        if "node_modules" in f.parts or ".next" in f.parts:
            continue
        if process_file(f):
            changed.append(f)
            print(f"  fixed: {f}")
    print(f"\nTotal files modified: {len(changed)}")
