@echo off
setlocal
chcp 65001 >nul
title 个人时间记录工具
cd /d "%~dp0"

echo 正在启动个人时间记录工具，请稍候...
echo.

where python >nul 2>nul
if not errorlevel 1 goto use_python

where py >nul 2>nul
if not errorlevel 1 goto use_py

echo [启动失败] 未找到 Python 3。
echo 你可以从 Anaconda Prompt 进入此文件夹后运行：python server.py
goto failed

:use_python
python server.py
set "exit_code=%errorlevel%"
goto finished

:use_py
py -3 server.py
set "exit_code=%errorlevel%"
goto finished

:finished
if "%exit_code%"=="0" exit /b 0
echo.
echo [启动失败] server.py 返回错误代码 %exit_code%。

:failed
echo.
echo 请不要关闭此窗口，拍下上面的错误信息发给我。
pause
exit /b 1
