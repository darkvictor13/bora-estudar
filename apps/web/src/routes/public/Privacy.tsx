import { LegalDocument, LegalSection, ContactLine } from "@/components/legal/LegalDocument";
import { LEGAL } from "@/lib/legal";

/**
 * A política de privacidade.
 *
 * Descreve o que o produto FAZ, e cada afirmação tem lastro no código: os dados
 * são os de `profiles`, `waitlist` e das tabelas de estudo; os operadores são os
 * que `supabase/config.toml`, o deploy e `lib/observability.ts` usam; a
 * exclusão é a de `delete_my_account` (spec 46). Mudou uma coisa, muda a outra —
 * a revisão jurídica do texto é de quem responde pelo produto.
 */
export function Privacy() {
  return (
    <LegalDocument title="Política de privacidade">
      <LegalSection heading="1. Quem trata os seus dados">
        <p>
          O controlador dos dados pessoais tratados nesta plataforma é {LEGAL.controllerName}. Para falar
          sobre os seus dados, use o contato: <ContactLine />.
        </p>
      </LegalSection>

      <LegalSection heading="2. Quais dados coletamos">
        <ul>
          <li><strong>Conta:</strong> nome, e-mail e senha. A senha é guardada pelo serviço de autenticação de forma irreversível; nem nós a lemos.</li>
          <li><strong>Lista de espera:</strong> WhatsApp, área de interesse, concurso em foco e, se você informar, data de nascimento e fuso horário.</li>
          <li><strong>Estudo:</strong> o planejamento montado pelo seu professor, as metas, o que você registra (questões, acertos, tempo), o progresso e as revisões de teoria, as marcações em leis e cartões, as anotações nos resumos e os baralhos que você cria.</li>
          <li><strong>Acesso:</strong> as liberações e bloqueios do seu acesso, com datas e prazo, e o plano ou cupom associado.</li>
          <li><strong>Técnicos:</strong> um identificador interno da conta, usado para relatar erros do site (sem nome nem e-mail), e o cookie de sessão descrito abaixo.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Para que usamos">
        <p>
          Para prestar o serviço contratado: montar a sua semana de estudo, registrar o que você estuda,
          mostrar o seu desempenho a você e ao seu professor, controlar quem tem acesso e manter a
          plataforma segura e funcionando. Não usamos os seus dados para publicidade e não os vendemos.
        </p>
      </LegalSection>

      <LegalSection heading="4. Quem vê os seus dados">
        <ul>
          <li><strong>O seu professor</strong> vê o seu nome, o seu planejamento e o seu desempenho, porque é ele quem conduz o seu estudo.</li>
          <li><strong>Os outros alunos não veem dados seus.</strong> Comparações com a turma usam médias e distribuições sem nome; no simulado, cada participante aparece como um número sorteado.</li>
          <li>Anotações e marcações em resumos, leis e cartões são privadas: nem o seu professor as lê.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Com quem compartilhamos">
        <p>Usamos prestadores que tratam dados em nosso nome, só para operar a plataforma:</p>
        <ul>
          <li><strong>Supabase</strong> — banco de dados e autenticação;</li>
          <li><strong>Cloudflare</strong> — hospedagem do site;</li>
          <li><strong>Sentry</strong> — relato de erros do site, que recebe apenas o identificador interno da conta e dados técnicos do erro, sem nome nem e-mail, e sem gravação de tela;</li>
          <li><strong>Provedor de envio de e-mail</strong> — confirmação de cadastro e recuperação de senha.</li>
        </ul>
        <p>Esses prestadores podem armazenar dados fora do Brasil, sempre sob as obrigações do nosso contrato com eles.</p>
      </LegalSection>

      <LegalSection heading="6. Cookies">
        <p>
          Usamos um único cookie, o de sessão, indispensável para manter você conectado. Não usamos
          cookies de publicidade, de análise de comportamento nem ferramentas de rastreamento.
        </p>
      </LegalSection>

      <LegalSection heading="7. Por quanto tempo guardamos">
        <p>
          Enquanto a sua conta existir. Ao excluí-la, valem as regras da próxima seção. As cópias de
          segurança mantidas pelo provedor do banco de dados expiram no ciclo de retenção dele, e não
          podem ser apagadas antes disso.
        </p>
      </LegalSection>

      <LegalSection heading="8. Como excluir a sua conta">
        <p>
          Em <strong>Meus dados</strong>, no cartão <strong>Excluir conta</strong>, você apaga a conta
          sem pedir a ninguém. Não há como desfazer.
        </p>
        <p><strong>O que é apagado:</strong> tudo o que você fez e escreveu — planejamento, cadernos, metas e registros de estudo, progresso e revisões de teoria, baterias e reforços, marcações em leis e cartões, anotações dos resumos, baralhos e cartões pessoais, revisões de cartões, a inscrição na lista de espera e a matrícula em turma. O seu login também deixa de existir: e-mail, telefone e senha são removidos, e o e-mail fica livre para um novo cadastro.</p>
        <p><strong>O que fica, sem identificar você:</strong> apenas o histórico de liberações e bloqueios de acesso (datas e prazos) e as notas dos simulados presenciais, que servem a estatísticas e à média da turma. Esses registros ficam ligados a uma conta que já não tem nome, e-mail, telefone nem professor.</p>
        <p>A conta de professor não é excluída por esse caminho; peça pelo contato da seção 1.</p>
      </LegalSection>

      <LegalSection heading="9. Os seus direitos">
        <p>
          A Lei Geral de Proteção de Dados (Lei 13.709/2018, art. 18) garante a você: confirmação de que
          tratamos dados seus, acesso, correção, anonimização, bloqueio ou eliminação do que for
          desnecessário, portabilidade, informação sobre com quem compartilhamos e revogação do
          consentimento. Você corrige o seu nome em Meus dados e exclui a conta pelo caminho acima. Para
          os demais pedidos, fale conosco <ContactLine />.
        </p>
      </LegalSection>

      <LegalSection heading="10. Segurança">
        <p>
          A comunicação com a plataforma é criptografada, e o banco de dados aplica o controle de acesso
          linha a linha: cada aluno só lê os próprios registros, mesmo que alguém tente consultar o banco
          fora da interface. Nenhum sistema é infalível; em caso de incidente que possa causar dano
          relevante, comunicaremos você e a autoridade competente, como a lei exige.
        </p>
      </LegalSection>

      <LegalSection heading="11. Mudanças nesta política">
        <p>
          Quando esta política mudar, a data no topo é atualizada. Mudanças que alterem o uso dos seus
          dados serão avisadas dentro da plataforma.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
