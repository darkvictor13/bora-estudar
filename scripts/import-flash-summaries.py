"""Extrai o DOCX fornecido para conteúdo estruturado; nunca executa seu conteúdo."""
import argparse
import hashlib
import json
from pathlib import Path
import posixpath
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
      "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "v": "urn:schemas-microsoft-com:vml"}


def slug(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "topico"


def extract(source, output):
    output.mkdir(parents=True, exist_ok=True)
    media = output / "media"
    media.mkdir(exist_ok=True)
    topics, subjects, assets = [], [], {}
    subject, topic = None, None
    with zipfile.ZipFile(source) as archive:
        rels = ET.fromstring(archive.read("word/_rels/document.xml.rels"))
        images = {r.attrib["Id"]: posixpath.normpath("word/" + r.attrib["Target"])
                  for r in rels if r.attrib.get("Type", "").endswith("/image")
                  and r.attrib.get("TargetMode") != "External"}
        root = ET.fromstring(archive.read("word/document.xml"))

        def new_topic(title):
            nonlocal topic
            base = f"pf2029-{subject['id']}-{slug(title)}"
            id_ = base
            suffix = 2
            while any(t["id"] == id_ for t in topics):
                id_ = f"{base}-{suffix}"
                suffix += 1
            topic = {"id": id_, "subject": subject["name"], "title": title,
                     "position": len(topics), "blocks": []}
            topics.append(topic)

        def paragraph(p):
            blocks, parts = [], []
            def flush():
                if parts:
                    text = "".join(parts)
                    if text.strip():
                        blocks.append({"type": "paragraph", "text": text})
                    parts.clear()
            for node in p.iter():
                if node.tag == f"{{{NS['w']}}}t":
                    parts.append(node.text or "")
                elif node.tag in (f"{{{NS['w']}}}br", f"{{{NS['w']}}}cr"):
                    parts.append("\n")
                elif node.tag == f"{{{NS['w']}}}tab":
                    parts.append("\t")
                elif node.tag in (f"{{{NS['a']}}}blip", f"{{{NS['v']}}}imagedata"):
                    rid = node.get(f"{{{NS['r']}}}embed") or node.get(f"{{{NS['r']}}}id")
                    target = images.get(rid)
                    if target and target.startswith("word/media/"):
                        flush()
                        payload = archive.read(target)
                        key = hashlib.sha256(payload).hexdigest() + Path(target).suffix.lower()
                        if key not in assets:
                            (media / key).write_bytes(payload)
                            assets[key] = {"key": key, "filename": Path(target).name}
                        blocks.append({"type": "image", "key": key, "alt": "Ilustração do resumo"})
            flush()
            return blocks

        for element in root.find("w:body", NS):
            if element.tag == f"{{{NS['w']}}}p":
                style = element.find("w:pPr/w:pStyle", NS)
                style = style.get(f"{{{NS['w']}}}val", "") if style is not None else ""
                title = "".join(t.text or "" for t in element.findall(".//w:t", NS)).strip()
                if style == "Ttulo1" and title:
                    subject = {"id": slug(title), "name": title, "position": len(subjects)}
                    subjects.append(subject)
                    topic = None
                    continue
                if subject is None:
                    subject = {"id": "introducao", "name": "Introdução", "position": 0}
                    subjects.append(subject)
                if style == "Ttulo2" and title:
                    new_topic(title)
                    continue
                if topic is None:
                    new_topic("Visão geral")
                if style == "Ttulo3" and title:
                    topic["blocks"].append({"type": "heading", "text": title})
                else:
                    topic["blocks"].extend(paragraph(element))
            elif element.tag == f"{{{NS['w']}}}tbl":
                if subject is None:
                    subject = {"id": "introducao", "name": "Introdução", "position": 0}
                    subjects.append(subject)
                if topic is None:
                    new_topic("Visão geral")
                rows = [[[block for p in cell.findall("w:p", NS) for block in paragraph(p)]
                         for cell in row.findall("w:tc", NS)] for row in element.findall("w:tr", NS)]
                topic["blocks"].append({"type": "table", "rows": rows})
        topics = [t for t in topics if t["blocks"]]
        result = {"source": source.name, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                  "subjects": subjects, "topics": topics, "assets": list(assets.values())}
        (output / "library.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        print(f"Extraídos {len(subjects)} seções, {len(topics)} tópicos e {len(assets)} imagens únicas.")
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path("content/summaries/local/pf2029"))
    args = parser.parse_args()
    extract(args.source, args.output)
