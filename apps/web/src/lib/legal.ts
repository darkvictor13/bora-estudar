/**
 * Quem responde pelos dados, num lugar só (R-LGPD-17).
 *
 * `/privacidade` e `/termos` leem daqui, e nenhuma outra tela repete o nome ou
 * o e-mail: o dia em que o controlador ou o contato mudar, muda uma linha.
 *
 * Os dois valores vêm de variável de ambiente, e não de constante, porque o
 * e-mail de contato é do negócio e não está em nenhum arquivo do repositório.
 * Acesso literal a `import.meta.env.VITE_*`: o Vite só reconhece essa forma.
 * Sem o e-mail, a política diz que o contato é o professor — o que é verdade,
 * mas não basta para o lançamento: a variável precisa estar preenchida no
 * Environment de produção.
 */
export const LEGAL = {
  productName: "Fronteira Concursos",
  controllerName: import.meta.env.VITE_LEGAL_CONTROLLER_NAME?.trim() || "Fronteira Concursos",
  contactEmail: import.meta.env.VITE_LEGAL_CONTACT_EMAIL?.trim() || "",
  /** Data da última revisão dos dois documentos, `DD/MM/AAAA`. */
  updatedAt: "15/10/2026",
} as const;
