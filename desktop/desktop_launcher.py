"""Windows desktop entry point for the personal time tracker."""

from __future__ import annotations

import ctypes
import os
import sys
import threading
import traceback
from pathlib import Path


SOURCE_ROOT = Path(__file__).resolve().parent.parent
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

import webview  # noqa: E402

from src import server as tracker_server  # noqa: E402


APP_TITLE = "个人时间记录工具"
APP_ID = "hrounder.personal-time-tracker"
ERROR_ALREADY_EXISTS = 183
MB_ICONERROR = 0x10
MB_ICONINFORMATION = 0x40


def show_message(message: str, flags: int) -> None:
    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(0, message, APP_TITLE, flags)
    else:
        print(message, file=sys.stderr)


def acquire_single_instance() -> tuple[int | None, bool]:
    if os.name != "nt":
        return None, False
    kernel32 = ctypes.windll.kernel32
    kernel32.SetLastError(0)
    handle = kernel32.CreateMutexW(None, False, f"Local\\{APP_ID}")
    already_running = kernel32.GetLastError() == ERROR_ALREADY_EXISTS
    return handle, already_running


def release_single_instance(handle: int | None) -> None:
    if os.name == "nt" and handle:
        ctypes.windll.kernel32.CloseHandle(handle)


def write_error_log() -> Path:
    log_path = tracker_server.PROJECT_ROOT / "启动错误.log"
    log_path.write_text(traceback.format_exc(), encoding="utf-8")
    return log_path


def run_desktop() -> int:
    mutex_handle, already_running = acquire_single_instance()
    if already_running:
        release_single_instance(mutex_handle)
        show_message("个人时间记录工具已经在运行。", MB_ICONINFORMATION)
        return 0

    http_server = None
    server_thread = None
    try:
        tracker_server.ensure_storage()
        http_server = tracker_server.ThreadingHTTPServer(
            ("127.0.0.1", 0), tracker_server.Handler
        )
        port = int(http_server.server_address[1])
        server_thread = threading.Thread(
            target=http_server.serve_forever,
            name="time-tracker-local-server",
            daemon=True,
        )
        server_thread.start()

        webview.create_window(
            APP_TITLE,
            f"http://127.0.0.1:{port}/",
            width=1360,
            height=900,
            min_size=(1100, 680),
            resizable=True,
            maximized=True,
            background_color="#f2f4f2",
            text_select=True,
        )
        webview.start(gui="edgechromium", debug=False, private_mode=True)
        return 0
    except Exception:
        try:
            log_path = write_error_log()
            detail = f"\n\n错误详情已保存到：\n{log_path}"
        except OSError:
            detail = ""
        show_message(
            "软件启动失败。请确认 Microsoft Edge WebView2 Runtime 可用，"
            "并且软件所在文件夹具有写入权限。" + detail,
            MB_ICONERROR,
        )
        return 1
    finally:
        if http_server is not None:
            http_server.shutdown()
            http_server.server_close()
        if server_thread is not None:
            server_thread.join(timeout=2)
        release_single_instance(mutex_handle)


if __name__ == "__main__":
    raise SystemExit(run_desktop())
