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


# Teto do bucket (64 MB) por arquivo, e um total que um DOCX legítimo não alcança.
MAX_PART_BYTES = 64 * 1024 * 1024
MAX_TOTAL_BYTES = 512 * 1024 * 1024
HEADING_NAME = re.compile(r"^(?:heading|t[ií]tulo)\s*([1-3])$", re.IGNORECASE)
HEADING_ID = re.compile(r"^(?:Heading|Ttulo|T[ií]tulo)([1-3])$")


def read_part(archive, name, limit=None):
    """Lê uma parte do ZIP recusando o que descomprime além do razoável."""
    limit = MAX_PART_BYTES if limit is None else limit
    info = archive.getinfo(name)
    if info.file_size > limit:
        raise ValueError(f"{name} descomprime para {info.file_size} bytes (limite {limit}).")
    return archive.read(name)


def parse_xml(payload, name):
    """ElementTree expande entidades: DOCX não precisa de DTD, então recusamos."""
    if b"<!DOCTYPE" in payload or b"<!ENTITY" in payload:
        raise ValueError(f"{name} declara DTD ou entidades; recusado.")
    return ET.fromstring(payload)


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
        if sum(info.file_size for info in archive.infolist()) > MAX_TOTAL_BYTES:
            raise ValueError("O DOCX descomprime além do limite total.")
        # Estilo de título pelo NOME do estilo (e não só pelo id): o id de
        # "Título 1" muda com o idioma do Word, e nada era reconhecido.
        heading_levels = {}
        if "word/styles.xml" in archive.namelist():
            styles = parse_xml(read_part(archive, "word/styles.xml"), "word/styles.xml")
            for style in styles.findall("w:style", NS):
                name = style.find("w:name", NS)
                match = HEADING_NAME.match(name.get(f"{{{NS['w']}}}val", "")) if name is not None else None
                if match:
                    heading_levels[style.get(f"{{{NS['w']}}}styleId", "")] = int(match.group(1))
        rels = parse_xml(read_part(archive, "word/_rels/document.xml.rels"), "word/_rels/document.xml.rels")
        images = {r.attrib["Id"]: posixpath.normpath("word/" + r.attrib["Target"])
                  for r in rels if r.attrib.get("Type", "").endswith("/image")
                  and r.attrib.get("TargetMode") != "External"}
        root = parse_xml(read_part(archive, "word/document.xml"), "word/document.xml")

        def heading_level(p):
            style = p.find("w:pPr/w:pStyle", NS)
            style = style.get(f"{{{NS['w']}}}val", "") if style is not None else ""
            if style in heading_levels:
                return heading_levels[style]
            match = HEADING_ID.match(style)
            return int(match.group(1)) if match else 0

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
                        payload = read_part(archive, target)
                        key = hashlib.sha256(payload).hexdigest() + Path(target).suffix.lower()
                        if key not in assets:
                            (media / key).write_bytes(payload)
                            assets[key] = {"key": key, "filename": Path(target).name}
                        blocks.append({"type": "image", "key": key, "alt": "Ilustração do resumo"})
            flush()
            return blocks

        def table_block(tbl):
            """Células guardam parágrafos e TABELAS aninhadas, na ordem do documento."""
            def cell_blocks(cell):
                blocks = []
                for child in cell:
                    if child.tag == f"{{{NS['w']}}}p":
                        blocks.extend(paragraph(child))
                    elif child.tag == f"{{{NS['w']}}}tbl":
                        blocks.append(table_block(child))
                return blocks
            return {"type": "table", "rows": [[cell_blocks(cell) for cell in row.findall("w:tc", NS)]
                                               for row in tbl.findall("w:tr", NS)]}

        for element in root.find("w:body", NS):
            if element.tag == f"{{{NS['w']}}}p":
                level = heading_level(element)
                title = "".join(t.text or "" for t in element.findall(".//w:t", NS)).strip()
                if level == 1 and title:
                    subject = {"id": slug(title), "name": title, "position": len(subjects)}
                    subjects.append(subject)
                    topic = None
                    continue
                if subject is None:
                    subject = {"id": "introducao", "name": "Introdução", "position": 0}
                    subjects.append(subject)
                if level == 2 and title:
                    new_topic(title)
                    continue
                if topic is None:
                    new_topic("Visão geral")
                if level == 3 and title:
                    topic["blocks"].append({"type": "heading", "text": title})
                else:
                    topic["blocks"].extend(paragraph(element))
            elif element.tag == f"{{{NS['w']}}}tbl":
                if subject is None:
                    subject = {"id": "introducao", "name": "Introdução", "position": 0}
                    subjects.append(subject)
                if topic is None:
                    new_topic("Visão geral")
                topic["blocks"].append(table_block(element))
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
