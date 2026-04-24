import tempfile
import unittest
from pathlib import Path

from tools.reverse_split_exporter import (
    check_rounding_up_flag,
    collect_events,
    normalize_date,
    parse_ratio,
)


class ReverseSplitExporterTests(unittest.TestCase):
    def test_parse_reverse_ratios(self):
        self.assertEqual(parse_ratio("1 for 10"), ("1-for-10", 1, 10))
        self.assertEqual(parse_ratio("1 : 10"), ("1-for-10", 1, 10))
        self.assertEqual(parse_ratio("1-for-10"), ("1-for-10", 1, 10))
        self.assertEqual(parse_ratio("1 for 3.5"), ("1-for-3.5", 1, 3.5))

    def test_rejects_forward_split(self):
        self.assertIsNone(parse_ratio("2-for-1"))
        self.assertIsNone(parse_ratio("1-for-1"))

    def test_normalize_date(self):
        self.assertEqual(normalize_date("Nov 14, 2025"), "2025-11-14")
        self.assertEqual(normalize_date("11/14/2025"), "2025-11-14")
        self.assertEqual(normalize_date("20251114"), "2025-11-14")

    def test_rounding_up_flag(self):
        self.assertTrue(
            check_rounding_up_flag(
                "In connection with the reverse split, fractional shares will be rounded up to the nearest whole share."
            )
        )
        self.assertFalse(check_rounding_up_flag("The company rounded up the financial totals in a table."))

    def test_deduplicates_and_merges_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / "archive.csv"
            edgar = root / "edgar.csv"
            archive.write_text(
                "Date,Symbol,Company Name,Type,Split Ratio\n"
                '"Nov 14, 2025",ABCD,Example Inc,Reverse,1 for 10\n',
                encoding="utf-8",
            )
            edgar.write_text(
                "ticker,cik,company_name,filing_date,form,filing_url,effective_date,ratio,rounding_up,summary,confidence,found_at\n"
                "ABCD,0001,Example Incorporated,20251101,8-K,https://sec.example/filing.txt,2025-11-14,1-for-10,True,Filed split terms.,High,2025-11-01T00:00:00Z\n",
                encoding="utf-8",
            )

            args = type(
                "Args",
                (),
                {
                    "archive_csv": [str(archive)],
                    "edgar_csv": str(edgar),
                    "skip_web": True,
                    "hedgefollow_selenium": False,
                },
            )()
            events = collect_events(args)

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["sources"], ["archive", "edgar"])
        self.assertTrue(events[0]["roundingUp"])
        self.assertEqual(events[0]["confidence"], "High")


if __name__ == "__main__":
    unittest.main()
