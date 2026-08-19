@echo off
setlocal
chcp 65001 >nul
title 个人时间记录工具

set "PROJECT_DIR=%~dp0"
set "SERVER_SCRIPT=%PROJECT_DIR%src\server.py"

if not exist "%SERVER_SCRIPT%" goto missing_server
cd /d "%PROJECT_DIR%"
if errorlevel 1 goto invalid_directory

where python >nul 2>nul
if errorlevel 1 goto try_py
python --version >nul 2>nul
if errorlevel 1 goto try_py
python "%SERVER_SCRIPT%" %*
set "exit_code=%errorlevel%"
goto finished

:try_py
where py >nul 2>nul
if errorlevel 1 goto missing_python
py -3 --version >nul 2>nul
if errorlevel 1 goto missing_python
py -3 "%SERVER_SCRIPT%" %*
set "exit_code=%errorlevel%"
goto finished

:missing_server
echo [启动失败] 找不到服务器文件：
echo %SERVER_SCRIPT%
set "exit_code=2"
goto finished

:invalid_directory
echo [启动失败] 无法进入项目目录：
echo %PROJECT_DIR%
set "exit_code=3"
goto finished

:missing_python
echo [启动失败] 未找到可用的 Python 3。
echo 请安装 Python 3，或在终端中确认 python / py 命令可用。
set "exit_code=4"

:finished
echo.
if "%exit_code%"=="0" (
  echo 服务已停止。
) else (
  echo 服务异常结束，错误代码：%exit_code%
)
echo 按任意键关闭此窗口……
pause >nul
exit /b %exit_code%
