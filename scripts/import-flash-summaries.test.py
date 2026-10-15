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


if __name__ == "__main__":
    unittest.main()
