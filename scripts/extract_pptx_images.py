#!/usr/bin/env python3
"""Extract embedded image files from a PowerPoint .pptx archive."""

from __future__ import annotations

import argparse
import shutil
import zipfile
from pathlib import Path
from textwrap import dedent


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PPTX = REPO_ROOT / "assets" / "data" / "附件4" / "配网数智AI(1).pptx"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "assets" / "data" / "附件4" / "配网数智AI(1)_images"
MEDIA_PREFIX = "ppt/media/"
IMAGE_EXTENSIONS = (
    ".bmp",
    ".emf",
    ".gif",
    ".jpeg",
    ".jpg",
    ".png",
    ".svg",
    ".tif",
    ".tiff",
    ".webp",
    ".wmf",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=(
            "从 PowerPoint .pptx 文件中提取内嵌图片，并保存到指定目录。\n"
            "默认会处理本项目附件4中的 配网数智AI(1).pptx。"
        ),
        epilog=dedent(
            f"""
            常用示例：

              # 1. 使用默认 pptx 和默认输出目录
              uv run python scripts/extract_pptx_images.py

              # 2. 重新提取并覆盖已存在的图片
              uv run python scripts/extract_pptx_images.py --overwrite

              # 3. 指定输出目录
              uv run python scripts/extract_pptx_images.py -o /private/tmp/pptx-images

              # 4. 指定其他 pptx，并输出到指定目录
              uv run python scripts/extract_pptx_images.py /path/to/demo.pptx -o /path/to/images

            默认值：

              默认 pptx:
                {DEFAULT_PPTX}

              默认输出目录:
                {DEFAULT_OUTPUT_DIR}

            输出命名：

              图片会按提取顺序保存为 001_image1.png、002_image10.jpg 这类文件名。
              不加 --overwrite 时，如果目标文件已存在，脚本会报错并停止。
            """
        ),
        add_help=False,
    )
    parser.add_argument("-h", "--help", action="help", help="显示帮助信息并退出。")
    parser.add_argument(
        "pptx",
        nargs="?",
        type=Path,
        default=DEFAULT_PPTX,
        metavar="PPTX",
        help="要读取的 PowerPoint .pptx 文件；不传则使用默认 pptx。",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        metavar="DIR",
        help="图片输出目录；不传则使用默认输出目录。",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="允许覆盖输出目录中已存在的同名图片。",
    )
    return parser.parse_args()


def media_members(pptx: Path) -> list[str]:
    with zipfile.ZipFile(pptx) as archive:
        return sorted(
            name
            for name in archive.namelist()
            if name.startswith(MEDIA_PREFIX)
            and not name.endswith("/")
            and name.lower().endswith(IMAGE_EXTENSIONS)
        )


def extract_images(pptx: Path, output_dir: Path, overwrite: bool) -> list[Path]:
    if not pptx.is_file():
        raise FileNotFoundError(f"PowerPoint file not found: {pptx}")

    members = media_members(pptx)
    if not members:
        raise ValueError(f"No embedded image files found in: {pptx}")

    output_dir.mkdir(parents=True, exist_ok=True)
    written_files: list[Path] = []

    with zipfile.ZipFile(pptx) as archive:
        for index, member in enumerate(members, start=1):
            source_name = Path(member).name
            output_path = output_dir / f"{index:03d}_{source_name}"
            if output_path.exists() and not overwrite:
                raise FileExistsError(
                    f"Output file already exists: {output_path}. "
                    "Use --overwrite to replace existing files."
                )

            with archive.open(member) as source, output_path.open("wb") as target:
                shutil.copyfileobj(source, target)
            written_files.append(output_path)

    return written_files


def main() -> None:
    args = parse_args()
    written_files = extract_images(args.pptx, args.output_dir, args.overwrite)
    print(f"Extracted {len(written_files)} image files to {args.output_dir}")
    for path in written_files:
        print(path)


if __name__ == "__main__":
    main()
