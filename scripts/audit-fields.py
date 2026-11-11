
import re, glob, pathlib

root = pathlib.Path(r"C:\CodeClone\research\yimubill")
docs = [p for p in root.glob("*.md") if "APK" in p.name]
doc = docs[0].read_text(encoding="utf-8")
types = "".join(pathlib.Path(r"C:\CodeClone\projects\ledger-app\src") .joinpath(f).read_text(encoding="utf-8") for f in ("types.ts","store.ts"))

sections = re.split(r"\n## ", doc)
ym = {}
for sec in sections[1:]:
    name = sec.split("\n")[0].strip()
    ym[name] = set(re.findall(r"`([a-zA-Z]+)`", sec))

ours = {}
for m in re.finditer(r"export interface (\w+) \{(.*?)\n\}", types, re.S):
    ours[m.group(1)] = set(re.findall(r"^\s{2}([a-zA-Z]+)\??:", m.group(2), re.M))

alias = {
  "Bill": "Bill", "Asset": "Asset", "Cycle": "Cycle", "Budget": "Budget",
  "Tag": "Tag", "Reimbursement": "Reimbursement", "Refund": "Refund",
  "Transfer": "Transfer", "Lend": "Lend", "AccountBook": "AccountBook",
  "ParentCategory": "Category", "BillFile": "BillFile",
}
print("实体               一木  我方  缺失字段")
for y, o in alias.items():
    if y not in ym: continue
    yf = ym[y]; of = ours.get(o, set())
    missing = sorted(yf - of)
    print(f"{y:<16}{len(yf):>5}{len(of):>6}  {', '.join(missing) if missing else '—'}")
