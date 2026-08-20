import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("summarize_by_week.py")
SPEC = importlib.util.spec_from_file_location("summarize_by_week", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class WeeklySummaryTests(unittest.TestCase):
    def test_merges_same_activity_inside_day_and_category(self):
        entries = [
            {
                "id": "1", "date": "2026-08-19", "startTime": "07:00", "endTime": "07:30",
                "activity": "通勤", "category": "日常", "timeAdjustment": 0,
            },
            {
                "id": "2", "date": "2026-08-19", "startTime": "18:00", "endTime": "18:20",
                "activity": "通勤", "category": "日常", "timeAdjustment": 10,
            },
            {
                "id": "3", "date": "2026-08-20", "startTime": "22:00", "endTime": "22:30",
                "activity": "洗漱", "category": "日常", "timeAdjustment": 0,
            },
        ]

        summary, warnings = MODULE.build_week_summary("2026-08-17", entries)

        self.assertEqual(warnings, [])
        self.assertIsNotNone(summary)
        self.assertEqual(summary["weekEnd"], "2026-08-23")
        self.assertEqual(summary["totalMinutes"], 90)
        self.assertEqual(set(summary["days"]), {"2026-08-19", "2026-08-20"})
        self.assertEqual(
            summary["days"]["2026-08-19"]["categories"]["日常"]["activities"],
            {"通勤": 60},
        )

    def test_does_not_merge_same_activity_across_categories(self):
        entries = [
            {
                "id": "1", "date": "2026-08-19", "startTime": "08:00", "endTime": "08:30",
                "activity": "阅读", "category": "学习", "timeAdjustment": 0,
            },
            {
                "id": "2", "date": "2026-08-19", "startTime": "20:00", "endTime": "20:30",
                "activity": "阅读", "category": "娱乐", "timeAdjustment": 0,
            },
        ]

        summary, _ = MODULE.build_week_summary("2026-08-17", entries)
        categories = summary["days"]["2026-08-19"]["categories"]

        self.assertEqual(categories["学习"]["activities"]["阅读"], 30)
        self.assertEqual(categories["娱乐"]["activities"]["阅读"], 30)

    def test_skips_empty_week_and_cleans_stale_output(self):
        summary, warnings = MODULE.build_week_summary(
            "2026-08-17",
            [{"id": "bad", "date": "not-a-date", "startTime": "08:00", "endTime": "09:00"}],
        )
        self.assertIsNone(summary)
        self.assertEqual(len(warnings), 1)

        with tempfile.TemporaryDirectory() as temporary_dir:
            output_dir = Path(temporary_dir)
            stale = output_dir / "weekly-summary-2026-08-10.json"
            stale.write_text("{}", encoding="utf-8")
            keep = output_dir / "notes.json"
            keep.write_text("{}", encoding="utf-8")

            MODULE.write_week_summaries({}, output_dir)

            self.assertFalse(stale.exists())
            self.assertTrue(keep.exists())


if __name__ == "__main__":
    unittest.main()
