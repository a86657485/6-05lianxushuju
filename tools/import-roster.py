"""Import only grade-six names into the local classroom roster."""
from pathlib import Path
import sys, json, hashlib
import openpyxl
source = Path(sys.argv[1])
output = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / 'roster.json'
workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
records, occurrences = [], {}
for sheet in workbook:
    for values in sheet.iter_rows(min_row=2, values_only=True):
        if len(values) < 2 or values[0] is None or values[1] is None:
            continue
        class_id = str(values[0]).strip().removesuffix('.0').removesuffix('班')
        name = str(values[1]).strip()
        if class_id not in [str(c) for c in range(601, 607)]:
            continue
        if not name:
            continue
        key = (class_id, name)
        occurrences[key] = occurrences.get(key, 0) + 1
        identity = hashlib.sha256((class_id + '\0' + name + '\0' + str(occurrences[key])).encode()).hexdigest()[:20]
        records.append({'id': f'g6-{class_id}-{identity}', 'classId': class_id, 'name': name})
if not records:
    raise SystemExit('未找到601—606班有效名单')
output.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'total': len(records), 'classes': {str(c): sum(r['classId'] == str(c) for r in records) for c in range(601, 607)}}, ensure_ascii=False))
