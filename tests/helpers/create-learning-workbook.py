"""Test-only JSON matrix on stdin to independently authored XLSX bytes on stdout."""
import json
import sys
from io import BytesIO

from openpyxl import Workbook


workbook = Workbook()
sheet = workbook.active
for row in json.load(sys.stdin):
    sheet.append(row)
output = BytesIO()
workbook.save(output)
sys.stdout.buffer.write(output.getvalue())
