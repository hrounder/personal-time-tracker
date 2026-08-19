# 个人时间记录工具（本地文件版）

一个面向个人使用的本地周时间记录工具。通过 Excel 式时间表拖选半小时单元格，快速创建、编辑和统计时间记录。

## 启动

需要已安装 Python 3。在项目根目录运行：

```powershell
python src/server.py
```

Windows 也可以使用：

```powershell
py -3 src/server.py
```

服务启动后会自动尝试打开浏览器。如果没有自动打开，请复制终端显示的地址；通常是 `http://127.0.0.1:8765/`。

不需要 `npm install`，不需要安装任何 Python 第三方库，也不需要联网。

## 项目结构

```text
personal-time-tracker/
├── README.md
├── src/
│   ├── app.js
│   ├── index.html
│   ├── server.py
│   └── style.css
├── config/  # 首次运行时自动创建，不提交到 Git
└── data/    # 首次运行时自动创建，不提交到 Git
```

## 界面功能

- 顶部“彩带特效”默认关闭；手动打开或关闭后会记住你的选择。
- 右上角“整体情况”可在一个屏幕内查看当前周完整 24 小时分布。
- 点击右上角关闭按钮、按 Esc 或点击遮罩区域均可退出总览。
- 右上角“导出数据”会把全部周记录导出为一个规则的 JSON 文件，便于交给 AI 分析。
- 时间表下方会按分类显示当前周的实际统计时长条形图；伤停补时会计入统计。
- 单击已有时间块可以修改事项、分类、伤停补时和备注，也可以使用红色“删除”按钮移除记录。
- 如果记录完全重叠，先编辑或删除最上层记录，下面的记录随后会显示出来。
- 新建记录选择“睡觉”分类时，事项会自动填写“睡觉”；手动修改后的事项不会被分类切换覆盖。

## 彩带消失时间

- 打开 `src/app.js`，修改文件开头的 `CONFETTI_FADE_MS`。
- near、medium、far 分别控制近、中、远三组彩带，单位是毫秒。
- 数值越小越早消失，建议先在 500–1800 之间尝试。
- 如果消失时间大于原飞行时间，飞行会同步延长，彩带不会停住后再消失。

## 首次启动与数据文件

第一次执行 `python src/server.py` 时：

- 自动创建项目顶层的 `data/` 和 `config/` 文件夹；
- 自动创建 `config/categories.json`；
- `config/preferences.json` 会在用户首次更改偏好设置时写入；
- 每周记录文件会在该周第一次保存记录时创建。

- `config/categories.json`：分类名称、分类颜色和可选颜色，跨周共用；
- `config/preferences.json`：彩带等用户偏好；
- `data/time-entries-YYYY-MM-DD.json`：一周的时间记录，日期是该周周一。

旧版本的 `data/categories.json` 会保留作为迁移备份；程序启动时会将它复制到 `config/categories.json`，之后分类配置与每周记录分别保存在不同文件夹。

例如某周周一为 2026 年 8 月 17 日，该周记录会保存在：

```text
data/time-entries-2026-08-17.json
```

如需完整备份，请同时复制 config 和 data 两个文件夹。

## 注意

- 不要直接双击 `src/index.html`；请通过 `python src/server.py` 启动，否则网页无法写入 JSON 文件。
- 服务只监听 `127.0.0.1`，其他电脑无法访问。
- 不要在工具运行时手动编辑正在使用的数据文件。

## 隐私与版本控制

- `data/`、`config/` 和 `backups/` 已加入 `.gitignore`，个人记录与配置不会被提交到 GitHub。
- 仓库公开前，请根据你的开源计划补充合适的 LICENSE 文件。
