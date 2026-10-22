#!/usr/bin/env python3
"""Build the field catalogue of the SOSTAC® tool for the claude.ai connector.

Reads SOSTAC_Strategy_Framework.html and writes
supabase/functions/sostac-coach/catalog.ts: every section, block and field
with its label and hint, plus the saved dynamic tables with their columns.
Run it after every change to the tool so the connector reads the same fields:

    python3 connector/build_catalog.py
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "SOSTAC_Strategy_Framework.html"
OUT = ROOT / "supabase" / "functions" / "sostac-coach" / "catalog.ts"

SECTION_KEYS = ["overview", "situation", "objectives", "strategy", "tactics",
                "action", "control", "architecture", "notes"]
NOT_PLAN = {"groupIdInput", "importFile"}
VOID = {"input", "br", "img", "hr", "meta", "link", "col", "area", "base",
        "embed", "source", "track", "wbr"}


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children = []

    @property
    def classes(self):
        return (self.attrs.get("class") or "").split()

    def has_class(self, c):
        return c in self.classes

    def text(self):
        out = []
        for c in self.children:
            out.append(c if isinstance(c, str) else c.text())
        return "".join(out)

    def iter(self):
        for c in self.children:
            if isinstance(c, Node):
                yield c
                yield from c.iter()

    def find_all(self, pred):
        return [n for n in self.iter() if pred(n)]

    def first(self, pred):
        return next((n for n in self.iter() if pred(n)), None)

    def closest(self, pred):
        n = self.parent
        while n is not None:
            if pred(n):
                return n
            n = n.parent
        return None


class Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", {}, None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def clean(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


def own_text(n):
    """Text of a node without nested form controls or badges."""
    out = []
    for c in n.children:
        if isinstance(c, str):
            out.append(c)
        elif c.tag not in ("input", "textarea", "select", "button") and not c.has_class("req-badge"):
            out.append(own_text(c))
    return clean(" ".join(out))


def label_for(ctrl):
    """Human label of a form control, as the student sees it."""
    parts = []
    row = ctrl.closest(lambda n: n.has_class("form-row"))
    if row is not None:
        lab = row.first(lambda n: n.has_class("form-label"))
        if lab is not None:
            parts.append(own_text(lab))
    if not parts:
        td = ctrl.closest(lambda n: n.tag == "td")
        tr = ctrl.closest(lambda n: n.tag == "tr")
        table = ctrl.closest(lambda n: n.tag == "table")
        if table is not None and table.has_class("print-wrap"):
            td = tr = table = None   # the print scaffold around the whole page
        if td is not None and tr is not None and table is not None:
            head = tr.first(lambda n: n.has_class("row-head"))
            cells = [c for c in tr.children if isinstance(c, Node) and c.tag == "td"]
            ths = table.find_all(lambda n: n.tag == "th")
            col = cells.index(td) if td in cells else -1
            colname = own_text(ths[col]) if 0 <= col < len(ths) else ""
            parts.append(" · ".join(p for p in (own_text(head) if head else "", colname) if p))
    if not parts:
        cell = ctrl.closest(lambda n: n.has_class("swot-cell") or n.has_class("arch-box"))
        if cell is not None:
            h = cell.first(lambda n: n.has_class("swot-cell-header"))
            parts.append(own_text(h) if h else own_text(cell))
    if not parts:
        lab = ctrl.closest(lambda n: n.tag == "label")
        if lab is not None:
            parts.append(own_text(lab))
    if not parts and ctrl.closest(lambda n: n.has_class("model-switch")) is not None:
        parts.append("Customer journey model (AIDA or AICPURA)")
    if not parts and ctrl.attrs.get("aria-label"):
        parts.append(ctrl.attrs["aria-label"])
    if not parts and ctrl.has_class("note-title"):
        parts.append("Title")
    if not parts and ctrl.closest(lambda n: n.has_class("note-block")) is not None:
        num = re.sub(r"\D", "", ctrl.attrs.get("id", ""))
        parts.append(f"Text of section {num}")
    # context: persona card, positioning block, presentation block
    for cls, head_cls in (("persona-card", "persona-card-header"), ("pos-block", "pos-head"),
                          ("pres-block", "pres-head")):
        box = ctrl.closest(lambda n, c=cls: n.has_class(c))
        if box is not None:
            h = box.first(lambda n, c=head_cls: n.has_class(c))
            if h is not None:
                kids = [k for k in h.children if isinstance(k, Node)]
                hs = own_text(kids[0]) if h.has_class("pres-head") and kids else own_text(h)
                parts.insert(0, re.sub(r"\s*—\s*$", "", hs))
    return " › ".join(p for p in parts if p) or ctrl.attrs.get("id", "")


def main():
    b = Builder()
    b.feed(SRC.read_text(encoding="utf-8"))
    root = b.root

    # saved dynamic containers, read from the tool's own saveAll()
    src = SRC.read_text(encoding="utf-8")
    m = re.search(r"function saveAll\(\)[\s\S]*?const dynamicTables = \[([\s\S]*?)\];", src)
    saved = re.findall(r"'([^']+)'", m.group(1)) if m else []

    sections = []
    for i, key in enumerate(SECTION_KEYS):
        panel = root.first(lambda n, i=i: n.attrs.get("id") == f"tab-{i}")
        if panel is None:
            continue
        head = panel.first(lambda n: n.has_class("section-header"))
        h2 = head.first(lambda n: n.tag == "h2") if head else None
        p = head.first(lambda n: n.tag == "p") if head else None
        title = "Overview — cover sheet and project brief" if key == "overview" else (own_text(h2) if h2 else key)
        sec = {"key": key, "title": title,
               "intro": "" if key == "overview" else (own_text(p) if p else ""),
               "blocks": []}
        # every section header inside the panel starts its own top-level group
        # (overview has Team Registration and Project Brief)
        block = None
        area = ""

        def new_block(title, hint=""):
            nonlocal block
            block = {"title": title, "area": area, "hint": hint, "items": []}
            sec["blocks"].append(block)

        seen = set()
        for n in panel.iter():
            if n.has_class("section-header") and n is not head:
                new_block(own_text(n.first(lambda x: x.tag == "h2")))
            elif n.has_class("pkg-head"):
                area = own_text(n)
            elif n.tag == "h3" and n.closest(lambda x: x.has_class("subsection")) is not None:
                sub = n.closest(lambda x: x.has_class("subsection"))
                hint = sub.first(lambda x: x.has_class("hint"))
                new_block(own_text(n), own_text(hint) if hint else "")
            elif n.tag in ("tbody", "div") and n.attrs.get("id") in saved and n.attrs["id"] not in seen:
                tid = n.attrs["id"]
                seen.add(tid)
                if block is None:
                    new_block(sec["title"])
                if n.tag == "tbody":
                    table = n.closest(lambda x: x.tag == "table")
                    cols = [own_text(th) for th in table.find_all(lambda x: x.tag == "th")]
                    block["items"].append({"kind": "table", "id": tid, "columns": cols})
                else:
                    kind = "platform-cards" if tid == "platform-list" else "campaign-cards"
                    block["items"].append({"kind": kind, "id": tid})
            elif n.tag in ("input", "textarea", "select"):
                fid = n.attrs.get("id")
                typ = n.attrs.get("type", n.tag)
                inside_saved = n.closest(lambda x: x.attrs.get("id") in saved) is not None
                if inside_saved or typ in ("radio", "file") or fid in NOT_PLAN:
                    continue
                if block is None:
                    new_block(sec["title"])
                if not fid:
                    # not stored by the tool: name it so Claude can say so
                    block["items"].append({"kind": "unsaved", "label": label_for(n)})
                    continue
                item = {"kind": "field", "id": fid, "label": label_for(n),
                        "type": "select" if n.tag == "select" else ("textarea" if n.tag == "textarea" else typ)}
                ph = clean(n.attrs.get("placeholder", ""))
                if ph:
                    item["placeholder"] = ph
                if n.tag == "select":
                    item["options"] = [own_text(o) for o in n.find_all(lambda x: x.tag == "option")]
                block["items"].append(item)
        sec["blocks"] = [bl for bl in sec["blocks"] if bl["items"]]
        sections.append(sec)

    # collapse "unsaved" runs into one note per block
    for sec in sections:
        for bl in sec["blocks"]:
            uns = [it["label"] for it in bl["items"] if it["kind"] == "unsaved"]
            bl["items"] = [it for it in bl["items"] if it["kind"] != "unsaved"]
            if uns:
                bl["unsaved"] = len(uns)   # fields the tool does not store (yet)

    catalog = {"source": SRC.name, "savedTables": saved, "sections": sections}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// GENERATED by connector/build_catalog.py from SOSTAC_Strategy_Framework.html — do not edit.\n"
        "import type { Catalog } from './types.ts';\n\n"
        "export const CATALOG: Catalog = " + json.dumps(catalog, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8")
    n_fields = sum(1 for s in sections for bl in s["blocks"] for it in bl["items"] if it["kind"] == "field")
    n_tables = sum(1 for s in sections for bl in s["blocks"] for it in bl["items"] if it["kind"] != "field")
    print(f"{OUT.relative_to(ROOT)}: {len(sections)} sections, {n_fields} fields, {n_tables} tables/card lists")


if __name__ == "__main__":
    sys.exit(main())
