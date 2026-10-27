"""Read only the observed CCS XLSX/CSV schema. No macros, formula execution or network."""
import csv, json, sys, zipfile, re
from decimal import Decimal
from datetime import datetime, timedelta
from pathlib import Path
import xml.etree.ElementTree as ET

NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
MAX_BYTES=10_000_000
def read_export(path):
    path=Path(path)
    if path.stat().st_size>MAX_BYTES:raise ValueError('file_too_large')
    if path.suffix.lower()=='.csv':
        with path.open(encoding='utf-8-sig',newline='') as handle:
            matrix=[row for row in csv.reader(handle) if any(value.strip() for value in row)]
        return {'format':'csv','matrix':matrix}
    if path.suffix.lower()!='.xlsx':raise ValueError('unsupported_file_type')
    with zipfile.ZipFile(path) as z:
        if len(z.infolist())>200 or sum(i.file_size for i in z.infolist())>30_000_000:raise ValueError('xlsx_expansion_limit')
        if any('externalLinks/' in n or 'vbaProject' in n for n in z.namelist()):raise ValueError('external_or_macro_content')
        wb=ET.fromstring(z.read('xl/workbook.xml'))
        props=wb.find('s:workbookPr',NS)
        if props is not None and props.get('date1904') in ('1','true'):raise ValueError('unsupported_date_system')
        if len(wb.findall('s:sheets/s:sheet',NS))!=1:raise ValueError('unexpected_sheet_count')
        shared=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            shared=[''.join(t.text or '' for t in s.findall('.//s:t',NS)) for s in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]
        root=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        matrix=[]
        for row in root.findall('s:sheetData/s:row',NS):
            if len(matrix)>=20001:raise ValueError('row_limit')
            values=['']*23
            for c in row.findall('s:c',NS):
                if c.find('s:f',NS) is not None:raise ValueError('formula_not_allowed')
                match=re.fullmatch(r'([A-Z]+)([0-9]+)',c.get('r',''))
                if not match:raise ValueError('cell_address')
                col=0
                for a in match[1]:col=col*26+ord(a)-64
                if col>23:raise ValueError('schema_changed')
                kind=c.get('t');v=c.find('s:v',NS);value=v.text if v is not None else ''
                if kind=='s':value=shared[int(value)]
                elif kind=='inlineStr':value=''.join(t.text or '' for t in c.findall('.//s:t',NS))
                elif kind in ('e','b'):raise ValueError('unsupported_cell_type')
                if matrix and col in (5,6) and value and kind not in ('s','inlineStr'):
                    serial=Decimal(value)
                    if serial<36526 or serial>73415:raise ValueError('date_out_of_range')
                    d=datetime(1899,12,30)+timedelta(seconds=int((serial*86400).to_integral_value()))
                    value=d.strftime('%d.%m.%Y' if col==5 else '%H:%M:%S')
                if matrix and col==7 and kind not in ('s','inlineStr'):raise ValueError('numeric_card_precision_unsafe')
                values[col-1]=value
            matrix.append(values)
        return {'format':'xlsx','matrix':matrix}

if __name__=='__main__':
    try:print(json.dumps(read_export(sys.argv[1]),ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({'error':str(exc)}),file=sys.stderr);sys.exit(1)
