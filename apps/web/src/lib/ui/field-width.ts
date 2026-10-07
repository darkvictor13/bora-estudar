/**
 * Largura de campo que não estoura a tela estreita (QA-23, R-UI-15).
 *
 * `minWidth` fixo dentro de linha flex é o defeito: o item flex tem
 * `min-width: auto` e cresce com o texto da opção escolhida, de modo que um
 * select de 260px não cabe nos ~253px úteis de um cartão em 375px e empurra a
 * linha inteira para fora. Abaixo de `sm` o campo ocupa a linha (`100%`, sem
 * mínimo), e o `Select` do MUI trunca o texto com reticências sozinho; de `sm`
 * para cima volta ao mínimo de antes. `maxWidth` fecha o caso de o mínimo ser
 * maior que o pai.
 */
export function fieldWidth(min: number) {
  return {
    minWidth: { xs: 0, sm: min },
    width: { xs: "100%", sm: "auto" },
    maxWidth: "100%",
  } as const;
}
