import unittest,tempfile,zipfile,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('reader',Path(__file__).with_name('ccs-read-export.py'))
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
def make(path,extra='',card_type='inlineStr',formula='',date1904='0',sheets=1):
    card='<is><t>7000000000000000001</t></is>' if card_type=='inlineStr' else '<v>7000000000000000001</v>'
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('xl/workbook.xml',f'<workbook xmlns="{NS}"><workbookPr date1904="{date1904}"/><sheets>'+''.join('<sheet name="Export"/>' for _ in range(sheets))+'</sheets></workbook>')
        z.writestr('xl/worksheets/sheet1.xml',f'<worksheet xmlns="{NS}"><sheetData><row><c r="A1" t="inlineStr"><is><t>Header</t></is></c></row><row><c r="E2"><v>46320.4458333333</v></c><c r="F2"><v>46320.4458333333</v></c><c r="G2" t="{card_type}">{card}{formula}</c></row></sheetData></worksheet>')
        if extra:z.writestr(extra,'test')
class ReaderTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'export.xlsx'
    def tearDown(self):self.tmp.cleanup()
    def test_real_date_serial(self):
        make(self.path);r=reader.read_export(self.path)['matrix'][1];self.assertEqual(r[4:7],['25.10.2026','10:42:00','7000000000000000001'])
    def test_numeric_card_rejected(self):
        make(self.path,card_type='n')
        with self.assertRaisesRegex(ValueError,'numeric_card'):reader.read_export(self.path)
    def test_formula_rejected(self):
        make(self.path,formula='<f>HYPERLINK("https://example.com")</f>')
        with self.assertRaisesRegex(ValueError,'formula'):reader.read_export(self.path)
    def test_external_links_rejected(self):
        make(self.path,extra='xl/externalLinks/externalLink1.xml')
        with self.assertRaisesRegex(ValueError,'external'):reader.read_export(self.path)
    def test_macros_rejected(self):
        make(self.path,extra='xl/vbaProject.bin')
        with self.assertRaisesRegex(ValueError,'macro'):reader.read_export(self.path)
    def test_1904_epoch_rejected(self):
        make(self.path,date1904='1')
        with self.assertRaisesRegex(ValueError,'date_system'):reader.read_export(self.path)
    def test_multiple_sheets_rejected(self):
        make(self.path,sheets=2)
        with self.assertRaisesRegex(ValueError,'sheet_count'):reader.read_export(self.path)
    def test_csv_identifier_is_text(self):
        p=self.path.with_suffix('.csv');p.write_text('Card,Value\n7000000000000000001,"12,3"\n');self.assertEqual(reader.read_export(p)['matrix'][1][0],'7000000000000000001')
if __name__=='__main__':unittest.main()
