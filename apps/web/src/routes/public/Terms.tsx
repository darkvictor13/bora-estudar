import { LegalDocument, LegalSection, ContactLine } from "@/components/legal/LegalDocument";
import { LEGAL } from "@/lib/legal";
import { ROUTES } from "@/lib/routes";
import Link from "@mui/material/Link";
import { Link as RouterLink } from "react-router";

/** Os termos de uso. Mesmo princípio de `Privacy.tsx`: o que o produto faz, e só isso. */
export function Terms() {
  return (
    <LegalDocument title="Termos de uso">
      <LegalSection heading="1. O serviço">
        <p>
          {LEGAL.productName} é uma plataforma de apoio ao estudo para concursos: o professor monta o seu
          planejamento semanal, e você registra o que estuda e acompanha o seu desempenho. Ao criar a
          conta, você declara ter lido estes termos e a{" "}
          <Link component={RouterLink} to={ROUTES.privacy}>Política de privacidade</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="2. Conta e acesso">
        <ul>
          <li>A conta é criada como aluno e fica pendente. O acesso às telas de estudo é liberado pelo seu professor, por um prazo, e pode vencer ou ser suspenso.</li>
          <li>Os dados do cadastro devem ser verdadeiros, e a senha é pessoal: você responde pelo que for feito com a sua conta.</li>
          <li>Você pode excluir a conta a qualquer momento em Meus dados, com as consequências descritas na política de privacidade.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Uso adequado">
        <p>Você se compromete a não:</p>
        <ul>
          <li>tentar acessar dados de outras pessoas ou burlar as regras de acesso da plataforma;</li>
          <li>copiar, redistribuir ou revender o material de estudo (aulas, cartões, resumos, textos de lei organizados pela plataforma), que é para uso pessoal;</li>
          <li>sobrecarregar o serviço com acessos automatizados ou usá-lo para fins ilícitos.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Conteúdo e propriedade">
        <p>
          O material e a organização da plataforma pertencem a {LEGAL.controllerName} e aos respectivos
          autores. O que você escreve — anotações, marcações, baralhos pessoais — é seu, e é apagado se
          você excluir a conta.
        </p>
      </LegalSection>

      <LegalSection heading="5. Limites do serviço">
        <p>
          A plataforma é uma ferramenta de apoio e não garante aprovação em concurso. Procuramos mantê-la
          disponível e correta, mas ela pode sofrer interrupções e mudanças; as de maior impacto serão
          avisadas.
        </p>
      </LegalSection>

      <LegalSection heading="6. Suspensão e encerramento">
        <p>
          O acesso pode ser suspenso ou encerrado em caso de descumprimento destes termos, de uso que
          comprometa a segurança ou a estabilidade do serviço, ou do fim do prazo contratado com o seu
          professor.
        </p>
      </LegalSection>

      <LegalSection heading="7. Mudanças e contato">
        <p>
          Podemos atualizar estes termos; a data no topo indica a versão vigente, e mudanças relevantes
          serão avisadas na plataforma. Dúvidas: fale conosco <ContactLine />. Estes termos seguem a
          legislação brasileira.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
