# Converte as quatro ilustrações EMF do Word para visualização no navegador.
param([string]$LibraryDirectory = 'content/summaries/local/pf2029')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$summaryRoot = (Resolve-Path -LiteralPath $LibraryDirectory).Path
$summaryIndex = Join-Path $summaryRoot 'library.json'
$summaryJson = [IO.File]::ReadAllText($summaryIndex)
Get-ChildItem -LiteralPath (Join-Path $summaryRoot 'media') -Filter '*.emf' | ForEach-Object {
    $summaryImage = [Drawing.Image]::FromFile($_.FullName)
    try {
        $summaryBitmap = [Drawing.Bitmap]::new($summaryImage.Width * 2, $summaryImage.Height * 2)
        $summaryGraphics = [Drawing.Graphics]::FromImage($summaryBitmap)
        try {
            $summaryGraphics.Clear([Drawing.Color]::White)
            $summaryGraphics.DrawImage($summaryImage, 0, 0, $summaryBitmap.Width, $summaryBitmap.Height)
            $summaryName = $_.BaseName + '.png'
            $summaryBitmap.Save((Join-Path $_.DirectoryName $summaryName), [Drawing.Imaging.ImageFormat]::Png)
            $summaryJson = $summaryJson.Replace($_.Name, $summaryName)
        } finally { $summaryGraphics.Dispose(); $summaryBitmap.Dispose() }
    } finally { $summaryImage.Dispose() }
}
[IO.File]::WriteAllText($summaryIndex, $summaryJson)
