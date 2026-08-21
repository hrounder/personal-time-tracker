# 个人时间记录工具

> 【置顶】2026.8.20：我们发布了这个工具的软件版，点击[这里进行下载](https://github.com/hrounder/personal-time-tracker/releases/tag/v0.4.0)。

下面是这个工具原本的源码介绍。

一个面向个人使用的本地周时间记录工具。通过 Excel 式时间表拖动半小时单元格，快速创建、编辑和统计时间记录。

## 启动

**注：** 源码版需要安装 Python 3；如未安装，推荐直接下载上方的软件版启动。

Windows 用户可以双击项目顶层的 `start.bat` 启动。

请勿将 `start.bat` 直接复制到桌面，否则会因为找不到项目文件而无法启动。可以右键点击 `start.bat`，选择“发送到 → 桌面快捷方式”，通过快捷方式从桌面打开。

也可以在项目根目录运行：

```powershell
python src/server.py
```

## 项目功能

- 拖动空白时间格创建记录，拖动已有记录块快速复制。
- 单击已有记录，可编辑事项、分类、时间和备注，或直接删除。
- 在完整周视图中预览一周 24 小时的时间分布。
- 显示每日分类时长，以及本周分类时长条形统计图。
- 自定义分类名称、颜色和排列顺序。
- 导出规则的 JSON 数据，便于交给 AI 分析或用于其他工具。
- 可选的彩带反馈特效，开关设置会被保留。
- 自动阻止记录占用同一时间段，避免重复统计。

## 项目结构

```text
personal-time-tracker/
├── README.md
├── start.bat                 # Windows 源码版启动程序
├── src/                      # 页面与本地服务源码
│   ├── app.js
│   ├── index.html
│   ├── server.py
│   └── style.css
├── desktop/                  # Windows 绿色软件构建文件
├── tool/
│   └── weekly-summary/       # 每周数据整理工具
├── config/                   # 分类与用户设置
├── data/                     # 每周时间记录
└── backups/                  # 本地备份
```

## 数据整理工具

`tool/weekly-summary/` 可以将每周的时间块记录整理为按日期、分类和事项汇总的 JSON；同一分类下名称相同的事项会合并统计。

```powershell
python tool/weekly-summary/summarize_by_week.py
```

结果保存在 `data/weekly-summary/`，具体格式和参数见 [`tool/weekly-summary/README.md`](tool/weekly-summary/README.md)。

## 注意

- 不要直接双击 `src/index.html`，否则页面无法将记录写入本地 JSON 文件。
- 服务只监听 `127.0.0.1`，其他电脑无法访问。
- 不要在工具运行时手动编辑正在使用的数据文件。
- `data/`、`config/` 和 `backups/` 不会提交到 GitHub，个人记录与配置保存在本机。
