"""Convert weekly time-block records into compact weekly summaries."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT_DIR = PROJECT_ROOT / "data"
DEFAULT_OUTPUT_DIR = DEFAULT_INPUT_DIR / "weekly-summary"
SOURCE_PREFIX = "time-entries-"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="把每周按时间块保存的记录整理为按日期、分类和事项汇总的 JSON。"
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=DEFAULT_INPUT_DIR,
        help=f"原始周记录目录（默认：{DEFAULT_INPUT_DIR}）",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"每周汇总输出目录（默认：{DEFAULT_OUTPUT_DIR}）",
    )
    return parser.parse_args()


def time_to_minutes(value: Any) -> int:
    text = str(value).strip()
    parts = text.split(":")
    if len(parts) != 2:
        raise ValueError(f"无效时间：{text!r}")
    hour, minute = (int(part) for part in parts)
    if hour == 24 and minute == 0:
        return 24 * 60
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError(f"无效时间：{text!r}")
    return hour * 60 + minute


def normalize_date(value: Any) -> str:
    text = str(value).strip()
    parsed = date.fromisoformat(text)
    if parsed.isoformat() != text:
        raise ValueError(f"无效日期：{text!r}")
    return text


def actual_duration_minutes(entry: dict[str, Any]) -> int:
    start = time_to_minutes(entry.get("startTime", ""))
    end = time_to_minutes(entry.get("endTime", ""))
    base_minutes = max(end - start, 0)
    try:
        adjustment = int(entry.get("timeAdjustment", 0))
    except (TypeError, ValueError) as exc:
        raise ValueError("timeAdjustment 必须是整数") from exc
    return max(base_minutes + adjustment, 0)


def load_week_files(
    input_dir: Path,
) -> tuple[list[tuple[str, list[dict[str, Any]]]], list[str]]:
    weeks: list[tuple[str, list[dict[str, Any]]]] = []
    warnings: list[str] = []

    for path in sorted(input_dir.glob(f"{SOURCE_PREFIX}*.json")):
        week_start_text = path.stem.removeprefix(SOURCE_PREFIX)
        try:
            week_start = normalize_date(week_start_text)
        except ValueError:
            warnings.append(f"跳过 {path.name}：文件名不包含有效的周起始日期")
            continue

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            warnings.append(f"跳过 {path.name}：无法读取 JSON（{exc}）")
            continue
        if not isinstance(payload, list):
            warnings.append(f"跳过 {path.name}：顶层数据不是数组")
            continue

        entries: list[dict[str, Any]] = []
        for index, item in enumerate(payload, start=1):
            if isinstance(item, dict):
                entries.append(item)
            else:
                warnings.append(f"跳过 {path.name} 第 {index} 条：记录不是对象")
        weeks.append((week_start, entries))

    return weeks, warnings


def build_week_summary(
    week_start: str, entries: list[dict[str, Any]]
) -> tuple[dict[str, Any] | None, list[str]]:
    grouped: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(int))
    )
    record_counts: dict[str, int] = defaultdict(int)
    warnings: list[str] = []

    for index, entry in enumerate(entries, start=1):
        record_id = str(entry.get("id", "")).strip() or f"第 {index} 条"
        try:
            day = normalize_date(entry.get("date", ""))
            minutes = actual_duration_minutes(entry)
        except (TypeError, ValueError) as exc:
            warnings.append(f"跳过记录 {record_id}：{exc}")
            continue

        category = str(entry.get("category", "")).strip() or "未分类"
        activity = str(entry.get("activity", "")).strip() or category
        grouped[day][category][activity] += minutes
        record_counts[day] += 1

    if not grouped:
        return None, warnings

    days: dict[str, dict[str, Any]] = {}
    week_total = 0
    processed_records = 0
    for day in sorted(grouped):
        categories: dict[str, Any] = {}
        day_total = 0
        for category, activities in grouped[day].items():
            activity_minutes = dict(activities)
            category_total = sum(activity_minutes.values())
            day_total += category_total
            categories[category] = {
                "totalMinutes": category_total,
                "activities": activity_minutes,
            }
        week_total += day_total
        processed_records += record_counts[day]
        days[day] = {
            "totalMinutes": day_total,
            "sourceRecordCount": record_counts[day],
            "categories": categories,
        }

    week_start_date = date.fromisoformat(week_start)
    return {
        "schemaVersion": "1.0",
        "weekStart": week_start,
        "weekEnd": (week_start_date + timedelta(days=6)).isoformat(),
        "totalMinutes": week_total,
        "sourceRecordCount": processed_records,
        "days": days,
    }, warnings


def write_week_summaries(
    summaries: dict[str, dict[str, Any]], output_dir: Path
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    destinations: set[Path] = set()
    for week_start, summary in summaries.items():
        destination = output_dir / f"weekly-summary-{week_start}.json"
        destinations.add(destination)
        temporary = destination.with_suffix(".json.tmp")
        temporary.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.replace(destination)

    for stale_path in output_dir.glob("weekly-summary-*.json"):
        if stale_path not in destinations:
            stale_path.unlink()


def main() -> int:
    args = parse_args()
    input_dir = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()

    if not input_dir.is_dir():
        print(f"错误：找不到原始数据目录：{input_dir}", file=sys.stderr)
        return 1

    week_files, load_warnings = load_week_files(input_dir)
    summaries: dict[str, dict[str, Any]] = {}
    summary_warnings: list[str] = []
    source_record_count = 0

    for week_start, entries in week_files:
        source_record_count += len(entries)
        summary, warnings = build_week_summary(week_start, entries)
        summary_warnings.extend(warnings)
        if summary is not None:
            summaries[week_start] = summary

    write_week_summaries(summaries, output_dir)

    for warning in (*load_warnings, *summary_warnings):
        print(f"警告：{warning}", file=sys.stderr)

    print(f"已读取 {source_record_count} 条原始记录。")
    print(f"已生成 {len(summaries)} 个每周汇总文件：{output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
