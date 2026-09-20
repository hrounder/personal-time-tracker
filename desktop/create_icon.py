"""Create a multi-size Windows icon matching the app's existing brand mark."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw


def create_icon(output_path: Path) -> None:
    size = 256
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((16, 16, 240, 240), radius=58, fill="#18201d")

    draw.rounded_rectangle(
        (65, 62, 191, 194), radius=15, outline="#fbfcfb", width=15
    )
    draw.line((65, 106, 191, 106), fill="#fbfcfb", width=14)
    draw.line((107, 106, 107, 194), fill="#fbfcfb", width=13)
    draw.line((149, 106, 149, 194), fill="#fbfcfb", width=13)
    draw.rounded_rectangle((149, 147, 191, 194), radius=8, fill="#56aa83")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(
        output_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: create_icon.py OUTPUT.ico")
    create_icon(Path(sys.argv[1]).resolve())
