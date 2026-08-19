"""个人时间记录工具本地服务：零第三方依赖，仅监听本机。"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
import threading
import webbrowser
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


WEB_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = WEB_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
CONFIG_DIR = PROJECT_ROOT / "config"
CATEGORIES_FILE = CONFIG_DIR / "categories.json"
PREFERENCES_FILE = CONFIG_DIR / "preferences.json"
LEGACY_CATEGORIES_FILE = DATA_DIR / "categories.json"
WEEK_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")
MAX_BODY_SIZE = 2 * 1024 * 1024
BASE_COLORS = [
    "#DCEBFA", "#DCEFEA", "#E2F1D5", "#FFF2C6",
    "#FBE4C8", "#F8D9D2", "#EADCF3",
]
DEFAULT_CATEGORIES = {
    "colors": BASE_COLORS,
    "categories": [
        {"name": "学习", "color": BASE_COLORS[0]},
        {"name": "工作", "color": BASE_COLORS[2]},
        {"name": "生活", "color": BASE_COLORS[4]},
    ],
}
DEFAULT_PREFERENCES = {"confettiEnabled": False}


def open_browser(url: str) -> None:
    """优先使用 Windows 文件关联打开，失败时回退到 Python 浏览器接口。"""
    try:
        if os.name == "nt":
            os.startfile(url)  # type: ignore[attr-defined]
        elif not webbrowser.open(url, new=2):
            raise OSError("系统没有返回可用的浏览器")
    except OSError as error:
        print(f"浏览器未能自动打开：{error}", flush=True)
        print(f"请手动复制此地址到浏览器：{url}", flush=True)


def atomic_write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def read_json(path: Path, fallback: object) -> object:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def week_file(week: str) -> Path:
    if not WEEK_PATTERN.fullmatch(week):
        raise ValueError("周日期必须使用 YYYY-MM-DD 格式")
    return DATA_DIR / f"time-entries-{week}.json"


def validate_categories(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("分类数据格式错误")
    categories = payload.get("categories")
    colors = payload.get("colors")
    if not isinstance(categories, list) or not isinstance(colors, list):
        raise ValueError("分类或颜色列表格式错误")

    cleaned_categories = []
    names = set()
    for item in categories:
        if not isinstance(item, dict):
            raise ValueError("分类项目格式错误")
        name = str(item.get("name", "")).strip()
        color = str(item.get("color", "")).upper()
        if not name or len(name) > 16 or name in names:
            raise ValueError("分类名称为空、重复或过长")
        if not COLOR_PATTERN.fullmatch(color):
            raise ValueError("分类颜色格式错误")
        names.add(name)
        cleaned_categories.append({"name": name, "color": color})

    cleaned_colors = []
    for color in [*BASE_COLORS, *colors]:
        normalized = str(color).upper()
        if COLOR_PATTERN.fullmatch(normalized) and normalized not in cleaned_colors:
            cleaned_colors.append(normalized)

    return {"categories": cleaned_categories, "colors": cleaned_colors}


def validate_preferences(payload: object) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get("confettiEnabled"), bool):
        raise ValueError("特效配置格式错误")
    return {"confettiEnabled": payload["confettiEnabled"]}


def validate_entries(payload: object) -> list:
    if not isinstance(payload, list):
        raise ValueError("时间记录必须是数组")
    required = ("id", "date", "startTime", "endTime", "activity", "category", "timeAdjustment", "note")
    cleaned = []
    for item in payload:
        if not isinstance(item, dict) or not all(key in item for key in required):
            raise ValueError("时间记录格式错误")
        cleaned.append({key: item[key] for key in required})
    return cleaned


def migrate_category_name(old_name: str, new_name: str) -> None:
    if not old_name or old_name == new_name:
        return
    for path in DATA_DIR.glob("time-entries-*.json"):
        entries = read_json(path, [])
        if not isinstance(entries, list):
            continue
        changed = False
        for entry in entries:
            if isinstance(entry, dict) and entry.get("category") == old_name:
                entry["category"] = new_name
                changed = True
        if changed:
            atomic_write_json(path, entries)


def time_to_minutes(value: object) -> int:
    match = re.fullmatch(r"(\d{2}):([0-5]\d)", str(value))
    if not match:
        return 0
    hour, minute = map(int, match.groups())
    if hour == 24 and minute == 0:
        return 24 * 60
    if hour > 23:
        return 0
    return hour * 60 + minute


def build_export() -> dict:
    settings = read_json(CATEGORIES_FILE, DEFAULT_CATEGORIES)
    categories = settings.get("categories", []) if isinstance(settings, dict) else []
    records = []
    weeks = set()

    for path in sorted(DATA_DIR.glob("time-entries-*.json")):
        week_start = path.stem.removeprefix("time-entries-")
        if not WEEK_PATTERN.fullmatch(week_start):
            continue
        entries = read_json(path, [])
        if not isinstance(entries, list):
            continue
        weeks.add(week_start)
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            date_text = str(entry.get("date", ""))
            try:
                weekday = datetime.strptime(date_text, "%Y-%m-%d").isoweekday()
            except ValueError:
                weekday = None
            start_time = str(entry.get("startTime", ""))
            end_time = str(entry.get("endTime", ""))
            duration = max(time_to_minutes(end_time) - time_to_minutes(start_time), 0)
            try:
                adjustment = int(entry.get("timeAdjustment", 0))
            except (TypeError, ValueError):
                adjustment = 0
            records.append({
                "id": str(entry.get("id", "")),
                "weekStart": week_start,
                "date": date_text,
                "weekday": weekday,
                "startTime": start_time,
                "endTime": end_time,
                "durationMinutes": duration,
                "timeAdjustmentMinutes": adjustment,
                "actualDurationMinutes": duration + adjustment,
                "activity": str(entry.get("activity", "")),
                "category": str(entry.get("category", "")),
                "note": str(entry.get("note", "")),
            })

    records.sort(key=lambda item: (item["date"], item["startTime"], item["id"]))
    category_minutes: dict[str, int] = {}
    for record in records:
        category = record["category"] or "未分类"
        category_minutes[category] = category_minutes.get(category, 0) + record["actualDurationMinutes"]

    return {
        "schemaVersion": "1.0",
        "exportedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "summary": {
            "weekCount": len(weeks),
            "recordCount": len(records),
            "durationMinutes": sum(item["durationMinutes"] for item in records),
            "actualDurationMinutes": sum(item["actualDurationMinutes"] for item in records),
            "actualMinutesByCategory": [
                {"category": category, "minutes": minutes}
                for category, minutes in sorted(category_minutes.items())
            ],
        },
        "categories": categories,
        "records": records,
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def log_message(self, format: str, *args: object) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/categories":
            self.send_json(read_json(CATEGORIES_FILE, DEFAULT_CATEGORIES))
            return
        if parsed.path == "/api/preferences":
            self.send_json(read_json(PREFERENCES_FILE, DEFAULT_PREFERENCES))
            return
        if parsed.path == "/api/export":
            self.send_json_download(
                build_export(),
                f"time-tracker-export-{datetime.now().date().isoformat()}.json",
            )
            return
        if parsed.path == "/api/entries":
            try:
                week = parse_qs(parsed.query).get("week", [""])[0]
                self.send_json(read_json(week_file(week), []))
            except ValueError as error:
                self.send_error_json(HTTPStatus.BAD_REQUEST, str(error))
            return
        if parsed.path == "/data" or parsed.path.startswith("/data/"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if parsed.path == "/config" or parsed.path.startswith("/config/"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        super().do_GET()

    def do_PUT(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            payload = self.read_json_body()
            if parsed.path == "/api/categories":
                cleaned = validate_categories(payload)
                rename = payload.get("rename") if isinstance(payload, dict) else None
                atomic_write_json(CATEGORIES_FILE, cleaned)
                if isinstance(rename, dict):
                    migrate_category_name(str(rename.get("from", "")), str(rename.get("to", "")))
                self.send_json(cleaned)
                return
            if parsed.path == "/api/preferences":
                cleaned_preferences = validate_preferences(payload)
                atomic_write_json(PREFERENCES_FILE, cleaned_preferences)
                self.send_json(cleaned_preferences)
                return
            if parsed.path == "/api/entries":
                week = parse_qs(parsed.query).get("week", [""])[0]
                cleaned_entries = validate_entries(payload)
                atomic_write_json(week_file(week), cleaned_entries)
                self.send_json({"saved": True, "count": len(cleaned_entries)})
                return
            self.send_error_json(HTTPStatus.NOT_FOUND, "接口不存在")
        except ValueError as error:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(error))
        except OSError as error:
            self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, f"写入文件失败：{error}")

    def read_json_body(self) -> object:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("请求长度错误") from error
        if length <= 0 or length > MAX_BODY_SIZE:
            raise ValueError("请求数据为空或过大")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("JSON 格式错误") from error

    def send_json(self, value: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json_download(self, value: object, filename: str) -> None:
        body = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status: HTTPStatus, message: str) -> None:
        self.send_json({"error": message}, status)


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not CATEGORIES_FILE.exists():
        if LEGACY_CATEGORIES_FILE.exists():
            shutil.copy2(LEGACY_CATEGORIES_FILE, CATEGORIES_FILE)
        else:
            atomic_write_json(CATEGORIES_FILE, DEFAULT_CATEGORIES)

    try:
        server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    except OSError:
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)

    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/"
    print("=" * 54, flush=True)
    print("个人时间记录工具已启动", flush=True)
    print(f"访问地址：{url}", flush=True)
    print("如果浏览器没有自动打开，请复制上面的地址。", flush=True)
    print("关闭这个窗口即可停止工具；数据不会丢失。", flush=True)
    print("=" * 54, flush=True)
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, open_browser, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
