import { Link, useLoaderData } from "react-router";

import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import {
  DeleteBlockForm,
  EditBlockForm,
  NewBlockForm,
  RestoreBlockForm,
  ToggleBlockForm,
  ToggleSubjectForm,
} from "@/components/teacher/BlockForms";
import { requireRole } from "@/lib/auth/session";
import { getAllTeacherPlans, getPlanBlocksForManagement } from "@/lib/data/teacher";
import { ROUTES } from "@/lib/routes";

/**
 * Os quatro recortes da v96, com "Ativos" como padrão (R-CAD-13).
 *
 * Sem eles, um catálogo de 92 blocos vira uma parede — que é exatamente o que a
 * tela anterior era.
 */
const VIEWS = {
  ativos: { label: "Ativos", keep: (b: Block) => b.active && !b.deleted_at },
  desativados: { label: "Desativados", keep: (b: Block) => !b.active && !b.deleted_at },
  excluidos: { label: "Excluídos", keep: (b: Block) => !!b.deleted_at },
  todos: { label: "Todos", keep: () => true },
} as const;

type ViewKey = keyof typeof VIEWS;

/**
 * Confirmações por query string.
 *
 * Excluir e restaurar movem a linha entre recortes, então o formulário que
 * mostraria a mensagem some na revalidação. Quem sobrevive é a página.
 */
const DONE_MESSAGE: Record<string, string> = {
  ativado: "Caderno ativado. Ele volta a entrar na geração de metas.",
  desativado:
    "Caderno desativado. Metas concluídas e estatísticas antigas foram preservadas.",
  "materia-ativada": "Disciplina ativada.",
  "materia-desativada": "Disciplina desativada.",
  editado: "Caderno atualizado. A mudança vale só para este planejamento.",
  excluido: "Caderno excluído. Ele continua em Excluídos e pode ser restaurado.",
  restaurado: "Caderno restaurado e ativado.",
  criado: "Caderno avulso criado.",
};
type Block = Awaited<ReturnType<typeof getPlanBlocksForManagement>>[number];

export async function teacherNotebooksLoader({ request }: { request: Request }) {
  const session = await requireRole("teacher");
  const plans = await getAllTeacherPlans(session.profileId);

  const params = new URL(request.url).searchParams;
  const requested = params.get("plano");
  const selectedId =
    requested && plans.some((p) => p.id === requested)
      ? requested
      : (plans.find((p) => p.status === "active")?.id ?? plans[0]?.id ?? null);

  const rawView = params.get("ver");
  const view: ViewKey = rawView && rawView in VIEWS ? (rawView as ViewKey) : "ativos";

  const blocks = selectedId ? await getPlanBlocksForManagement(selectedId) : [];
  const feito = params.get("feito");

  return {
    plans,
    selectedId,
    view,
    blocks,
    doneMessage: feito ? (DONE_MESSAGE[feito] ?? null) : null,
  };
}

type LoaderData = Awaited<ReturnType<typeof teacherNotebooksLoader>>;

export function TeacherNotebooks() {
  const { plans, selectedId, view, blocks, doneMessage } = useLoaderData() as LoaderData;
  const selected = plans.find((p) => p.id === selectedId) ?? null;
  const ctx = { planId: selectedId ?? "", view };

  // Todos os contadores derivam da lista. Nenhum é mantido à mão (R-CAD-14).
  const totals = {
    cadernos: blocks.filter((b) => !b.deleted_at).length,
    ativos: blocks.filter((b) => b.active && !b.deleted_at).length,
    desativados: blocks.filter((b) => !b.active && !b.deleted_at).length,
    excluidos: blocks.filter((b) => b.deleted_at).length,
  };

  const visible = blocks.filter(VIEWS[view].keep);

  const bySubject = new Map<string, Block[]>();
  for (const block of visible) {
    bySubject.set(block.subject_name, [...(bySubject.get(block.subject_name) ?? []), block]);
  }

  return (
    <>
      <PageHeader
        title="Cadernos"
        description="Desativar impede o uso na geração de novas metas. Metas concluídas e estatísticas antigas são preservadas."
      />

      {doneMessage && <Alert kind="success">{doneMessage}</Alert>}

      {plans.length === 0 ? (
        <Empty>Nenhum planejamento criado. Crie um em Planejamentos.</Empty>
      ) : (
        <>
          <Card title="Planejamento">
            <nav className="row" aria-label="Planejamentos">
              {plans.map((plan) => (
                <Link
                  key={plan.id}
                  to={`${ROUTES.teacher.notebooks}?plano=${plan.id}`}
                  className={`btn btn--sm ${plan.id === selectedId ? "btn--primary" : "btn--ghost"}`}
                >
                  {plan.studentName} · {plan.name}
                </Link>
              ))}
            </nav>
          </Card>

          {selected && (
            <>
              <div className="grid-cards">
                <Card title="Cadernos">
                  <p className="stat__value">{totals.cadernos}</p>
                </Card>
                <Card title="Ativos">
                  <p className="stat__value">{totals.ativos}</p>
                </Card>
                <Card title="Desativados">
                  <p className="stat__value">{totals.desativados}</p>
                </Card>
                <Card title="Excluídos">
                  <p className="stat__value">{totals.excluidos}</p>
                </Card>
              </div>

              <Card
                title={`${selected.studentName} — ${selected.name}`}
                sub={`${visible.length} caderno(s) neste recorte`}
                action={
                  <nav className="row" aria-label="Recortes">
                    {(Object.keys(VIEWS) as ViewKey[]).map((key) => (
                      <Link
                        key={key}
                        to={`${ROUTES.teacher.notebooks}?plano=${selectedId}&ver=${key}`}
                        className={`btn btn--sm ${key === view ? "btn--primary" : "btn--ghost"}`}
                        aria-current={key === view ? "true" : undefined}
                      >
                        {VIEWS[key].label}
                      </Link>
                    ))}
                  </nav>
                }
              >
                {visible.length === 0 ? (
                  <Empty>Nenhum caderno neste recorte.</Empty>
                ) : (
                  <div className="stack">
                    {[...bySubject.entries()].map(([subject, list]) => (
                      <div key={subject} className="stack-sm">
                        <div className="row">
                          <h3 style={{ color: list[0]?.subject_color }}>{subject}</h3>
                          {view !== "excluidos" && (
                            <ToggleSubjectForm
                              studyPlanId={selectedId!}
                              subjectName={subject}
                              anyActive={list.some((b) => b.active && !b.deleted_at)}
                              ctx={ctx}
                            />
                          )}
                        </div>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Caderno</th>
                                <th className="num">Questões</th>
                                <th className="num">Meta</th>
                                <th>Origem</th>
                                <th>Situação</th>
                                <th />
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {list.map((block) => (
                                <tr key={block.id}>
                                  <td>
                                    {block.link ? (
                                      <a href={block.link} target="_blank" rel="noreferrer">
                                        {block.name}
                                      </a>
                                    ) : (
                                      block.name
                                    )}
                                  </td>
                                  <td className="num">{block.question_count || "—"}</td>
                                  <td className="num">{block.subject_target}%</td>
                                  <td className="muted">
                                    {block.catalog_block_id ? "Catálogo" : "Avulso"}
                                  </td>
                                  <td>
                                    {block.deleted_at ? (
                                      <Badge tone="red">Excluído</Badge>
                                    ) : block.active ? (
                                      <Badge tone="green">Ativo</Badge>
                                    ) : (
                                      <Badge tone="amber">Desativado</Badge>
                                    )}
                                  </td>
                                  <td>
                                    {block.deleted_at ? (
                                      <RestoreBlockForm blockId={block.id} ctx={ctx} />
                                    ) : (
                                      <div className="row">
                                        <ToggleBlockForm
                                          blockId={block.id}
                                          active={block.active}
                                          ctx={ctx}
                                        />
                                        <EditBlockForm block={block} ctx={ctx} />
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    {!block.deleted_at && (
                                      <DeleteBlockForm
                                        blockId={block.id}
                                        goalCount={block.goalCount}
                                        ctx={ctx}
                                      />
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title="Caderno avulso"
                sub="Para material que não está no catálogo. Nasce ativo, no fim da disciplina."
              >
                <NewBlockForm
                  studyPlanId={selectedId!}
                  studentId={selected.student_id}
                  ctx={ctx}
                />
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
