# PADRÃO OFICIAL DE IDs — VADE MECUM POLICIAL

## Regra central

Toda entidade persistente terá:

- `id`: UUID interno do banco.
- `canonical_id`: ID legível, único e estável.
- `ordem`: número visual/editável, que pode mudar sem quebrar vínculos.

## 1. Normas

Formato:

`PAIS-ESFERA-TIPO-NUMERO-ANO`

Exemplos:

- `BR-FED-LEI-11343-2006`
- `BR-FED-LEI-8072-1990`
- `BR-FED-DL-2848-1940`
- `BR-FED-DL-3689-1941`
- `BR-FED-DEC-678-1992`
- `BR-PR-LEI-1943-1954`
- `BR-PR-LC-245-2022`
- `BR-PR-DEC-5075-1998`

## 2. Constituição

- `BR-CF-1988`

Dispositivos:

- `BR-CF-1988-ART-5`
- `BR-CF-1988-ART-5-P3`
- `BR-CF-1988-ART-144-P2`

## 3. Dispositivos

Sempre derivam do `canonical_id` da norma.

Exemplos:

- `BR-FED-LEI-11343-2006-ART-33`
- `BR-FED-LEI-11343-2006-ART-33-P4`
- `BR-FED-LEI-11343-2006-ART-40-VI`
- `BR-PR-LEI-1943-1954-TIT-II-CAP-IV`

Convenções:

- ART = artigo
- P = parágrafo
- INC = inciso
- AL = alínea
- TIT = título
- CAP = capítulo
- SEC = seção
- SUBSEC = subseção

## 4. Editais

Formato:

`EDITAL-ORGAO-CARGO-ANO-NUMERO`

Exemplos:

- `EDITAL-PMPR-SOLDADO-2025-01`
- `EDITAL-PPPR-POLICIAL-PENAL-2024-001`
- `EDITAL-PRF-POLICIAL-2021-01`

## 5. Flashcards

Formato sugerido:

`FC-MATERIA-TOPICO-SEQUENCIAL`

Exemplos:

- `FC-DP-TEORIA-CRIME-0001`
- `FC-LEG-DROGAS-0033`
- `FC-DH-SISTEMA-INTERAMERICANO-0012`

O número do flashcard mostrado ao aluno NÃO é o ID permanente.

## 6. Questões

Formato:

`Q-BANCA-ANO-ORGAO-SEQUENCIAL`

Exemplos:

- `Q-CEBRASPE-2021-PRF-0001`
- `Q-IBFC-2025-PMPR-0001`

## 7. Relações

A base deve permitir:

`edital -> norma -> dispositivo -> flashcard -> questão`

Assim, se um dispositivo for alterado, o sistema consegue localizar todos os objetos dependentes.

## 8. Regra de imutabilidade

Depois de publicado, o `canonical_id` não deve ser renumerado.

Mudanças de título, ordem, nome popular ou posição visual não alteram o `canonical_id`.
