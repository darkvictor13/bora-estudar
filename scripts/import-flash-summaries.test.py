"""Verifica a estrutura, quebras de linha, imagens e tabelas da importação."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("importer", Path(__file__).with_name("import-flash-summaries.py"))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class ImportTests(unittest.TestCase):
    def test_preserves_order_and_media(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "test.docx"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("word/_rels/document.xml.rels", '<Relationships><Relationship Id="r1" Type="test/image" Target="media/image.png"/></Relationships>')
                archive.writestr("word/media/image.png", b"original-image")
                archive.writestr("word/document.xml", '''<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
                <w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr><w:r><w:t>Informática</w:t></w:r></w:p>
                <w:p><w:pPr><w:pStyle w:val="Ttulo2"/></w:pPr><w:r><w:t>Redes</w:t></w:r></w:p>
                <w:p><w:r><w:t>Antes</w:t><w:br/><w:t>da imagem</w:t><a:blip r:embed="r1"/><w:t>Depois</w:t></w:r></w:p>
                <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Célula</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
                </w:body></w:document>''')
            result = importer.extract(source, Path(directory) / "out")
            blocks = result["topics"][0]["blocks"]
            self.assertEqual([b["type"] for b in blocks], ["paragraph", "image", "paragraph", "table"])
            self.assertEqual(blocks[0]["text"], "Antes\nda imagem")
            self.assertEqual(blocks[3]["rows"][0][0][0]["text"], "Célula")
            self.assertEqual((Path(directory) / "out/media" / blocks[1]["key"]).read_bytes(), b"original-image")
            self.assertEqual(json.loads((Path(directory) / "out/library.json").read_text(encoding="utf-8"))["source"], "test.docx")

    def docx(self, directory, body, styles=None):
        source = Path(directory) / "caso.docx"
        with zipfile.ZipFile(source, "w") as archive:
            archive.writestr("word/_rels/document.xml.rels", "<Relationships/>")
            if styles:
                archive.writestr("word/styles.xml", styles)
            archive.writestr("word/document.xml", f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>')
        return source

    def test_headings_come_from_the_style_name_not_only_the_pt_br_id(self):
        # Word em inglês grava "Heading1"; um id personalizado vem do styles.xml.
        styles = ('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                  '<w:style w:styleId="MeuTitulo"><w:name w:val="heading 1"/></w:style>'
                  '<w:style w:styleId="MeuSub"><w:name w:val="Título 2"/></w:style></w:styles>')
        body = ('<w:p><w:pPr><w:pStyle w:val="MeuTitulo"/></w:pPr><w:r><w:t>Penal</w:t></w:r></w:p>'
                '<w:p><w:pPr><w:pStyle w:val="MeuSub"/></w:pPr><w:r><w:t>Inquérito</w:t></w:r></w:p>'
                '<w:p><w:r><w:t>Corpo</w:t></w:r></w:p>'
                '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Processo</w:t></w:r></w:p>'
                '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Prazos</w:t></w:r></w:p>'
                '<w:p><w:r><w:t>Outro corpo</w:t></w:r></w:p>')
        with tempfile.TemporaryDirectory() as directory:
            result = importer.extract(self.docx(directory, body, styles), Path(directory) / "out")
            self.assertEqual([(t["subject"], t["title"]) for t in result["topics"]],
                             [("Penal", "Inquérito"), ("Processo", "Prazos")])

    def test_nested_tables_are_kept(self):
        inner = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Interna</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
        body = ('<w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr><w:r><w:t>A</w:t></w:r></w:p>'
                '<w:p><w:pPr><w:pStyle w:val="Ttulo2"/></w:pPr><w:r><w:t>B</w:t></w:r></w:p>'
                f'<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Externa</w:t></w:r></w:p>{inner}</w:tc></w:tr></w:tbl>')
        with tempfile.TemporaryDirectory() as directory:
            result = importer.extract(self.docx(directory, body), Path(directory) / "out")
            cell = result["topics"][0]["blocks"][0]["rows"][0][0]
            self.assertEqual(cell[0]["text"], "Externa")
            self.assertEqual(cell[1]["type"], "table")
            self.assertEqual(cell[1]["rows"][0][0][0]["text"], "Interna")

    def test_refuses_dtd_and_oversized_parts(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "dtd.docx"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("word/_rels/document.xml.rels", "<Relationships/>")
                archive.writestr("word/document.xml", '<!DOCTYPE d [<!ENTITY a "x">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>')
            with self.assertRaisesRegex(ValueError, "DTD"):
                importer.extract(source, Path(directory) / "out")
            original = importer.MAX_PART_BYTES
            importer.MAX_PART_BYTES = 10
            try:
                with self.assertRaisesRegex(ValueError, "descomprime"):
                    importer.extract(self.docx(directory, "<w:p/>"), Path(directory) / "out2")
            finally:
                importer.MAX_PART_BYTES = original


if __name__ == "__main__":
    unittest.main()
