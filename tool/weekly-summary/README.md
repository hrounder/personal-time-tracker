# 每周数据整理工具

把 `data/time-entries-YYYY-MM-DD.json` 中按时间块保存的记录，整理成每个有记录的星期一个、适合交给 AI 读取的汇总文件。文件内部仍然按日期、分类和事项组织。

## 使用方法

在项目根目录执行：

```powershell
python tool/weekly-summary/summarize_by_week.py
```

不需要安装第三方依赖。工具会读取 `data/` 下的全部周记录，并把结果写入：

```text
data/weekly-summary/weekly-summary-YYYY-MM-DD.json
```

文件名日期与原始周记录相同，表示该周周一。空周不会生成文件。重复运行会更新现有周汇总，并清理已经没有有效记录的旧周汇总；工具不会修改任何原始记录。

## 汇总规则

- 每个有记录的星期生成一个 JSON 文件。
- 文件内部只列出实际有记录的日期，不添加空日期。
- 每个日期先按分类归组，再合并分类下名称相同的事项。
- `totalMinutes` 和事项时长均包含原记录的“伤停补时”。
- 空分类记为“未分类”；空事项使用分类名称。
- 原始记录即使时间重叠也会分别计入，本工具不会自行判断或删除重复记录。
- 无法解析的记录会跳过，并在命令行显示警告。

输出示例：

```json
{
  "schemaVersion": "1.0",
  "weekStart": "2026-08-17",
  "weekEnd": "2026-08-23",
  "totalMinutes": 90,
  "sourceRecordCount": 3,
  "days": {
    "2026-08-19": {
      "totalMinutes": 90,
      "sourceRecordCount": 3,
      "categories": {
        "日常": {
          "totalMinutes": 90,
          "activities": {
            "通勤": 60,
            "洗漱": 30
          }
        }
      }
    }
  }
}
```

其中所有时长的单位均为分钟：`60` 等于 `1h`，`30` 等于 `0.5h`。

## 指定其他目录

```powershell
python tool/weekly-summary/summarize_by_week.py --input-dir "D:\my-data" --output-dir "D:\weekly-summary"
```
