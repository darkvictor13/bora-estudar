"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import type { ResolvedRoute } from "@/lib/routes/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchAllRowsInBatches } from "@/lib/supabase/pagination";
import { disciplineColors } from "@/theme/tokens";
import {
  CoursePhase,
  StudyModel,
  SubjectMode,
  MaterialKind,
  Course,
  Subject,
  CourseSubject,
  CatalogNotebook,
  CatalogLesson,
  LessonMaterial,
  COURSE_COLUMNS,
  SUBJECT_COLUMNS,
  expectRecord,
  callRpc,
  loadCourses,
  loadSubjects,
  loadCourseSubjects,
  useRemoteData,
  useRpcAction,
  asText,
  asNumber,
  optionalText,
  labelFor,
  Status,
  Feedback,
  EmptyPanel,
  RemoteContent,
  Section,
  Field,
  SubmitButton,
  SoftDeleteControl,
} from "./shared";
import styles from "../AdminDomainPage.module.css";

function CourseEditor({ course, onDone }: { course?: Course; onDone: () => void }) {
  const action = useRpcAction(onDone);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const weekly = asNumber(form, "metas_semanais_padrao");
    if (weekly < 1 || weekly > 100) {
      action.setFeedback({ kind: "error", text: "A quantidade semanal deve estar entre 1 e 100." });
      return;
    }
    await action.run(
      () => callRpc("salvar_curso", {
        p_id: course?.id ?? null,
        p_codigo: asText(form, "codigo"),
        p_nome: asText(form, "nome"),
        p_area: optionalText(form, "area"),
        p_concurso_alvo: optionalText(form, "concurso_alvo"),
        p_fase: asText(form, "fase") as CoursePhase,
        p_modelo_estudo: asText(form, "modelo_estudo") as StudyModel,
        p_metas_semanais_padrao: weekly,
        p_ativo: form.get("ativo") === "on",
      }),
      course ? "Curso atualizado e recarregado do catálogo." : "Curso criado no catálogo.",
    );
  }

  return (
    <form className={styles.formGrid} onSubmit={save} key={course?.updated_at ?? "new-course"}>
      <Field label="Código"><input className="be-input" name="codigo" defaultValue={course?.codigo ?? ""} required /></Field>
      <Field label="Nome"><input className="be-input" name="nome" defaultValue={course?.nome ?? ""} required /></Field>
      <Field label="Área"><input className="be-input" name="area" defaultValue={course?.area ?? ""} /></Field>
      <Field label="Concurso-alvo"><input className="be-input" name="concurso_alvo" defaultValue={course?.concurso_alvo ?? ""} /></Field>
      <Field label="Fase"><select className="be-input" name="fase" defaultValue={course?.fase ?? "pre_edital"}><option value="pre_edital">Pré-edital</option><option value="pos_edital">Pós-edital</option></select></Field>
      <Field label="Modelo de estudo"><select className="be-input" name="modelo_estudo" defaultValue={course?.modelo_estudo ?? "teoria_blocos"}><option value="teoria_blocos">Teoria e blocos</option><option value="somente_blocos">Somente blocos</option></select></Field>
      <Field label="Metas semanais padrão"><input className="be-input" name="metas_semanais_padrao" type="number" min="1" max="100" defaultValue={course?.metas_semanais_padrao ?? 24} required /></Field>
      <label className={styles.check}><input name="ativo" type="checkbox" defaultChecked={course?.ativo ?? true} /> Curso ativo</label>
      <div className={styles.formActions}><SubmitButton busy={action.busy}>{course ? "Salvar curso" : "Criar curso"}</SubmitButton></div>
      <Feedback state={action.feedback} />
    </form>
  );
}

function CoursesPage() {
  const loader = useCallback(() => loadCourses(), []);
  const remote = useRemoteData(loader);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<"todos" | "ativos" | "inativos" | "excluidos">("todos");

  return <RemoteContent remote={remote}>{(courses) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const filtered = courses.filter((course) => {
      const matchesTerm = !term || [course.codigo, course.nome, course.area, course.concurso_alvo].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
      const matchesVisibility = visibility === "todos"
        || (visibility === "ativos" && course.ativo && !course.deleted_at)
        || (visibility === "inativos" && !course.ativo && !course.deleted_at)
        || (visibility === "excluidos" && Boolean(course.deleted_at));
      return matchesTerm && matchesVisibility;
    });
    return <Section title="Catálogo de cursos" description={`${filtered.length} curso(s) encontrado(s).`} actions={<Link className="be-button be-button--primary" href="/admin/catalogo/cursos/novo">Novo curso</Link>}>
      <div className={styles.filters} role="search">
        <Field label="Buscar"><input className="be-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código, nome, área ou concurso" /></Field>
        <Field label="Situação"><select className="be-input" value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="todos">Todos</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="excluidos">Excluídos</option></select></Field>
      </div>
      {filtered.length === 0 ? <EmptyPanel title="Nenhum curso">Cadastre um curso ou altere os filtros.</EmptyPanel> : <div className={styles.cardGrid}>{filtered.map((course) => <article className={styles.catalogCard} key={course.id}>
        <div className={styles.cardTop}><span className={styles.code}>{course.codigo}</span><Status value={course.deleted_at ? "excluido" : course.ativo ? "ativo" : "inativo"} /></div>
        <h3>{course.nome}</h3><p>{course.area || "Área não informada"}{course.concurso_alvo ? ` · ${course.concurso_alvo}` : ""}</p>
        <dl className={styles.compactDetails}><div><dt>Modelo</dt><dd>{labelFor(course.modelo_estudo)}</dd></div><div><dt>Metas/semana</dt><dd>{course.metas_semanais_padrao}</dd></div></dl>
        <div className={styles.actions}><Link className="be-button" href={`/admin/catalogo/cursos/${course.id}/resumo`}>Administrar</Link><SoftDeleteControl deleted={Boolean(course.deleted_at)} id={course.id} label={course.nome} onDone={remote.reload} resource="curso" /></div>
      </article>)}</div>}
    </Section>;
  }}</RemoteContent>;
}

function NewCoursePage() {
  const [saved, setSaved] = useState(false);
  return <Section title="Dados do curso" description="O código identifica o curso nas regras e deve ser único.">
    <CourseEditor onDone={() => setSaved(true)} />
    {saved ? <div className={styles.nextStep} role="status"><strong>Curso salvo.</strong><span>Agora associe disciplinas, cadernos e aulas a partir do catálogo.</span><Link className="be-button" href="/admin/catalogo/cursos">Voltar aos cursos</Link></div> : null}
  </Section>;
}

function CourseSummaryPage({ courseId }: { courseId: string }) {
  const loader = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient().from("cursos").select(COURSE_COLUMNS).eq("id", courseId).maybeSingle();
    return expectRecord<Course>(data, error);
  }, [courseId]);
  const remote = useRemoteData(loader);
  return <RemoteContent remote={remote} skeleton="detail">{(course) => course ? <div className={styles.stack}>
    <CourseContext course={course} current="resumo" />
    <Section title="Configuração geral" description="Alterações afetam novas configurações; planejamentos existentes mantêm seus snapshots.">
      {course.deleted_at ? <EmptyPanel title="Curso excluído">Restaure o curso para voltar a editá-lo.</EmptyPanel> : <CourseEditor course={course} onDone={remote.reload} />}
    </Section>
    <Section title="Ciclo de vida" description="A exclusão é lógica, reversível e auditável."><SoftDeleteControl deleted={Boolean(course.deleted_at)} id={course.id} label={course.nome} onDone={remote.reload} resource="curso" /></Section>
  </div> : <EmptyPanel title="Curso não encontrado">O curso não existe ou não está visível para esta sessão.</EmptyPanel>}</RemoteContent>;
}

function CourseContext({ course, current }: { course: Course; current: "resumo" | "disciplinas" | "cadernos" | "aulas" }) {
  const base = `/admin/catalogo/cursos/${course.id}`;
  return <div className={styles.context}>
    <div><span className={styles.code}>{course.codigo}</span><strong>{course.nome}</strong></div>
    <nav aria-label={`Configuração de ${course.nome}`}>
      {(["resumo", "disciplinas", "cadernos", "aulas"] as const).map((item) => <Link key={item} href={`${base}/${item}`} aria-current={current === item ? "page" : undefined}>{labelFor(item)}</Link>)}
    </nav>
  </div>;
}

function SubjectEditor({ onDone, subject }: { onDone: () => void; subject?: Subject }) {
  const action = useRpcAction(onDone);
  const [color, setColor] = useState(subject?.cor ?? "");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const color = optionalText(form, "cor");
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      action.setFeedback({ kind: "error", text: "A cor deve usar o formato hexadecimal #RRGGBB." });
      return;
    }
    await action.run(() => callRpc("salvar_disciplina", {
      p_id: subject?.id ?? null,
      p_codigo: asText(form, "codigo"),
      p_nome: asText(form, "nome"),
      p_cor: color,
      p_ativo: form.get("ativo") === "on",
    }), subject ? "Disciplina atualizada no catálogo." : "Disciplina criada no catálogo.");
  }
  return <form className={styles.formGrid} onSubmit={save} key={subject?.updated_at ?? "new-subject"}>
    <Field label="Código"><input className="be-input" name="codigo" defaultValue={subject?.codigo ?? ""} required /></Field>
    <Field label="Nome"><input className="be-input" name="nome" defaultValue={subject?.nome ?? ""} required /></Field>
    <Field label="Cor hexadecimal (opcional)">
      <div className={styles.colorPicker}>
        <input
          aria-label="Selecionar cor da disciplina"
          className={styles.colorPickerInput}
          type="color"
          value={color || disciplineColors[0]}
          onChange={(event) => setColor(event.target.value.toUpperCase())}
        />
        <input name="cor" type="hidden" value={color} />
        <span className={styles.colorPickerValue} aria-live="polite">{color || "Padrão do tema"}</span>
        <button
          className="be-button be-button--ghost"
          type="button"
          onClick={() => setColor(color ? "" : disciplineColors[0])}
        >
          {color ? "Usar padrão" : "Escolher esta cor"}
        </button>
      </div>
    </Field>
    <label className={styles.check}><input name="ativo" type="checkbox" defaultChecked={subject?.ativo ?? true} /> Disciplina ativa</label>
    <div className={styles.formActions}><SubmitButton busy={action.busy}>{subject ? "Salvar disciplina" : "Criar disciplina"}</SubmitButton></div>
    <Feedback state={action.feedback} />
  </form>;
}

function SubjectsPage() {
  const loader = useCallback(() => loadSubjects(), []);
  const remote = useRemoteData(loader);
  const [search, setSearch] = useState("");
  return <RemoteContent remote={remote}>{(subjects) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const filtered = subjects.filter((subject) => !term || subject.nome.toLocaleLowerCase("pt-BR").includes(term) || subject.codigo.toLocaleLowerCase("pt-BR").includes(term));
    return <div className={styles.stack}>
      <Section title="Nova disciplina" description="Disciplinas globais podem ser associadas a vários cursos."><SubjectEditor onDone={remote.reload} /></Section>
      <Section title="Disciplinas globais" description={`${filtered.length} registro(s)`}>
        <div className={styles.filters} role="search"><Field label="Buscar"><input className="be-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código ou nome" /></Field></div>
        {filtered.length === 0 ? <EmptyPanel title="Nenhuma disciplina">Crie a primeira disciplina ou altere a busca.</EmptyPanel> : <div className="be-table-wrap"><table className="be-table"><thead><tr><th>Disciplina</th><th>Cor</th><th>Situação</th><th><span className={styles.srOnly}>Abrir</span></th></tr></thead><tbody>{filtered.map((subject) => <tr key={subject.id}>
          <td><strong>{subject.nome}</strong><small className={styles.blockCode}>{subject.codigo}</small></td>
          <td><span className={styles.color} style={{ backgroundColor: subject.cor ?? "var(--color-border-strong)" }} aria-label={subject.cor ?? "Cor padrão"} /> {subject.cor || "Padrão"}</td>
          <td><Status value={subject.deleted_at ? "excluido" : subject.ativo ? "ativo" : "inativo"} /></td>
          <td><Link className={styles.textLink} href={`/admin/catalogo/disciplinas/${subject.id}`}>Detalhes</Link></td>
        </tr>)}</tbody></table></div>}
      </Section>
    </div>;
  }}</RemoteContent>;
}

function SubjectDetailPage({ subjectId }: { subjectId: string }) {
  const loader = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient().from("disciplinas").select(SUBJECT_COLUMNS).eq("id", subjectId).maybeSingle();
    return expectRecord<Subject>(data, error);
  }, [subjectId]);
  const remote = useRemoteData(loader);
  return <RemoteContent remote={remote} skeleton="form">{(subject) => subject ? <div className={styles.stack}>
    <Section title={subject.nome} description={`Código ${subject.codigo}`} actions={<Status value={subject.deleted_at ? "excluido" : subject.ativo ? "ativo" : "inativo"} />}>
      {subject.deleted_at ? <EmptyPanel title="Disciplina excluída">Restaure o registro para voltar a editá-lo.</EmptyPanel> : <SubjectEditor subject={subject} onDone={remote.reload} />}
    </Section>
    <Section title="Ciclo de vida" description="A exclusão lógica preserva associações e histórico."><SoftDeleteControl deleted={Boolean(subject.deleted_at)} id={subject.id} label={subject.nome} onDone={remote.reload} resource="disciplina" /></Section>
  </div> : <EmptyPanel title="Disciplina não encontrada">O registro não existe ou não está visível.</EmptyPanel>}</RemoteContent>;
}

function CourseSubjectEditor({ courseId, item, onDone, subjects }: { courseId: string; item?: CourseSubject; onDone: () => void; subjects: Subject[] }) {
  const action = useRpcAction(onDone);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const meta = asNumber(form, "meta_padrao");
    const weight = asNumber(form, "peso_padrao");
    const order = asNumber(form, "ordem");
    if (meta < 0 || meta > 100 || weight <= 0 || order < 0) {
      action.setFeedback({ kind: "error", text: "Use meta de 0 a 100, peso maior que zero e ordem não negativa." });
      return;
    }
    await action.run(() => callRpc("salvar_curso_disciplina", {
      p_id: item?.id ?? null,
      p_curso_id: courseId,
      p_disciplina_id: asText(form, "disciplina_id"),
      p_modalidade: asText(form, "modalidade") as SubjectMode,
      p_meta_padrao: meta,
      p_peso_padrao: weight,
      p_ordem: order,
      p_ativo: form.get("ativo") === "on",
    }), item ? "Associação atualizada." : "Disciplina associada ao curso.");
  }
  return <form className={styles.formGrid} onSubmit={save} key={item?.updated_at ?? "new-course-subject"}>
    <Field label="Disciplina"><select className="be-input" name="disciplina_id" defaultValue={item?.disciplina_id ?? ""} required><option value="" disabled>Selecione</option>{subjects.filter((subject) => !subject.deleted_at).map((subject) => <option key={subject.id} value={subject.id}>{subject.nome} ({subject.codigo})</option>)}</select></Field>
    <Field label="Modalidade"><select className="be-input" name="modalidade" defaultValue={item?.modalidade ?? "blocos"}><option value="blocos">Blocos</option><option value="teoria">Teoria</option><option value="ambos">Ambos</option></select></Field>
    <Field label="Meta padrão (%)"><input className="be-input" name="meta_padrao" type="number" step="0.01" min="0" max="100" defaultValue={item?.meta_padrao ?? 80} required /></Field>
    <Field label="Peso"><input className="be-input" name="peso_padrao" type="number" step="0.01" min="0.01" defaultValue={item?.peso_padrao ?? 1} required /></Field>
    <Field label="Ordem"><input className="be-input" name="ordem" type="number" min="0" defaultValue={item?.ordem ?? 0} required /></Field>
    <label className={styles.check}><input name="ativo" type="checkbox" defaultChecked={item?.ativo ?? true} /> Associação ativa</label>
    <div className={styles.formActions}><SubmitButton busy={action.busy}>{item ? "Salvar associação" : "Associar disciplina"}</SubmitButton></div>
    <Feedback state={action.feedback} />
  </form>;
}

type CourseSubjectData = { course: Course | null; items: CourseSubject[]; subjects: Subject[] };

function CourseSubjectsPage({ courseId }: { courseId: string }) {
  const loader = useCallback(async (): Promise<CourseSubjectData> => {
    const [courses, subjects, items] = await Promise.all([loadCourses(), loadSubjects(), loadCourseSubjects(courseId)]);
    return { course: courses.find((course) => course.id === courseId) ?? null, subjects, items };
  }, [courseId]);
  const remote = useRemoteData(loader);
  return <RemoteContent remote={remote} skeleton="form">{(data) => {
    if (!data.course) return <EmptyPanel title="Curso não encontrado">O curso não existe ou não está visível.</EmptyPanel>;
    const subjects = new Map(data.subjects.map((subject) => [subject.id, subject]));
    const alreadyLinked = new Set(data.items.filter((item) => !item.deleted_at).map((item) => item.disciplina_id));
    const selectable = data.subjects.filter((subject) => !alreadyLinked.has(subject.id));
    return <div className={styles.stack}>
      <CourseContext course={data.course} current="disciplinas" />
      <Section title="Associar disciplina" description="A modalidade, meta e peso serão usados como padrão em novos planejamentos.">
        {selectable.length === 0 ? <EmptyPanel title="Sem disciplinas disponíveis">Todas as disciplinas vigentes já estão associadas. Crie outra disciplina global ou restaure uma associação.</EmptyPanel> : <CourseSubjectEditor courseId={courseId} subjects={selectable} onDone={remote.reload} />}
      </Section>
      <Section title="Disciplinas do curso" description={`${data.items.length} associação(ões), incluindo o histórico excluído.`}>
        {data.items.length === 0 ? <EmptyPanel title="Nenhuma disciplina associada">Use o formulário acima para montar o curso.</EmptyPanel> : <div className={styles.recordCards}>{data.items.map((item) => {
          const subject = subjects.get(item.disciplina_id);
          return <article className={styles.recordCard} key={item.id}>
            <div className={styles.recordHeader}><div><span className={styles.code}>Ordem {item.ordem}</span><h3>{subject?.nome ?? item.disciplina_id}</h3></div><Status value={item.deleted_at ? "excluido" : item.ativo ? "ativo" : "inativo"} /></div>
            <dl className={styles.compactDetails}><div><dt>Modalidade</dt><dd>{labelFor(item.modalidade)}</dd></div><div><dt>Meta</dt><dd>{item.meta_padrao}%</dd></div><div><dt>Peso</dt><dd>{item.peso_padrao}</dd></div></dl>
            {!item.deleted_at ? <details className={styles.detailsPanel}><summary>Editar configuração</summary><CourseSubjectEditor courseId={courseId} item={item} subjects={data.subjects} onDone={remote.reload} /></details> : null}
            <SoftDeleteControl deleted={Boolean(item.deleted_at)} id={item.id} label={subject?.nome ?? item.id} onDone={remote.reload} resource="curso_disciplina" />
          </article>;
        })}</div>}
      </Section>
    </div>;
  }}</RemoteContent>;
}

function NotebookEditor({ courseSubjectId, item, onDone }: { courseSubjectId: string; item?: CatalogNotebook; onDone: () => void }) {
  const action = useRpcAction(onDone);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const total = asNumber(form, "total_questoes");
    const order = asNumber(form, "ordem");
    if (total < 0 || order < 0) {
      action.setFeedback({ kind: "error", text: "Total de questões e ordem não podem ser negativos." });
      return;
    }
    await action.run(() => callRpc("salvar_caderno_catalogo", {
      p_id: item?.id ?? null,
      p_curso_disciplina_id: courseSubjectId,
      p_nome: asText(form, "nome"),
      p_link_tec: optionalText(form, "link_tec"),
      p_total_questoes: total,
      p_ordem: order,
      p_ativo: form.get("ativo") === "on",
    }), item ? "Caderno atualizado." : "Caderno adicionado ao catálogo.");
  }
  return <form className={styles.formGrid} onSubmit={save} key={item?.updated_at ?? courseSubjectId}>
    <Field label="Nome"><input className="be-input" name="nome" defaultValue={item?.nome ?? ""} required /></Field>
    <Field label="Link TEC"><input className="be-input" name="link_tec" type="url" defaultValue={item?.link_tec ?? ""} placeholder="https://…" /></Field>
    <Field label="Total de questões"><input className="be-input" name="total_questoes" type="number" min="0" defaultValue={item?.total_questoes ?? 0} required /></Field>
    <Field label="Ordem"><input className="be-input" name="ordem" type="number" min="0" defaultValue={item?.ordem ?? 0} required /></Field>
    <label className={styles.check}><input name="ativo" type="checkbox" defaultChecked={item?.ativo ?? true} /> Caderno ativo</label>
    <div className={styles.formActions}><SubmitButton busy={action.busy}>{item ? "Salvar caderno" : "Adicionar caderno"}</SubmitButton></div>
    <Feedback state={action.feedback} />
  </form>;
}

type NotebooksData = { course: Course | null; items: CatalogNotebook[]; links: CourseSubject[]; subjects: Subject[] };

function CourseNotebooksPage({ courseId }: { courseId: string }) {
  const loader = useCallback(async (): Promise<NotebooksData> => {
    const [courses, subjects, links] = await Promise.all([loadCourses(), loadSubjects(), loadCourseSubjects(courseId)]);
    const linkIds = links.map((item) => item.id);
    let items: CatalogNotebook[] = [];
    if (linkIds.length > 0) {
      const supabase = getSupabaseBrowserClient();
      items = await fetchAllRowsInBatches<CatalogNotebook, string>(linkIds, (ids, from, to) => supabase
        .from("cadernos_catalogo")
        .select("id,curso_disciplina_id,nome,link_tec,total_questoes,ordem,ativo,created_at,updated_at,deleted_at")
        .in("curso_disciplina_id", ids)
        .order("ordem", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to));
    }
    return { course: courses.find((course) => course.id === courseId) ?? null, subjects, links, items };
  }, [courseId]);
  const remote = useRemoteData(loader);
  const [selectedLink, setSelectedLink] = useState("");

  return <RemoteContent remote={remote} skeleton="form">{(data) => {
    if (!data.course) return <EmptyPanel title="Curso não encontrado">O curso não existe ou não está visível.</EmptyPanel>;
    const subjects = new Map(data.subjects.map((subject) => [subject.id, subject]));
    const links = new Map(data.links.map((link) => [link.id, link]));
    const eligibleLinks = data.links.filter((link) => !link.deleted_at);
    const effectiveSelected = eligibleLinks.some((link) => link.id === selectedLink) ? selectedLink : eligibleLinks[0]?.id ?? "";
    return <div className={styles.stack}>
      <CourseContext course={data.course} current="cadernos" />
      <Section title="Adicionar caderno" description="O caderno pertence a uma disciplina já associada ao curso.">
        {eligibleLinks.length === 0 ? <EmptyPanel title="Associe uma disciplina primeiro">Cadernos exigem uma disciplina vigente no curso.</EmptyPanel> : <>
          <Field label="Disciplina do curso"><select className="be-input" value={effectiveSelected} onChange={(event) => setSelectedLink(event.target.value)}>{eligibleLinks.map((link) => <option key={link.id} value={link.id}>{subjects.get(link.disciplina_id)?.nome ?? link.disciplina_id}</option>)}</select></Field>
          <NotebookEditor courseSubjectId={effectiveSelected} onDone={remote.reload} />
        </>}
      </Section>
      <Section title="Cadernos do curso" description={`${data.items.length} registro(s), incluindo histórico excluído.`}>
        {data.items.length === 0 ? <EmptyPanel title="Nenhum caderno">Adicione o primeiro caderno do catálogo.</EmptyPanel> : <div className={styles.recordCards}>{data.items.map((item) => {
          const link = links.get(item.curso_disciplina_id);
          const subject = link ? subjects.get(link.disciplina_id) : null;
          return <article className={styles.recordCard} key={item.id}>
            <div className={styles.recordHeader}><div><span className={styles.code}>{subject?.nome ?? "Disciplina"} · ordem {item.ordem}</span><h3>{item.nome}</h3></div><Status value={item.deleted_at ? "excluido" : item.ativo ? "ativo" : "inativo"} /></div>
            <p>{item.total_questoes} questões {item.link_tec ? <>· <a className={styles.textLink} href={item.link_tec} target="_blank" rel="noreferrer">Abrir TEC</a></> : null}</p>
            {!item.deleted_at ? <details className={styles.detailsPanel}><summary>Editar caderno</summary><NotebookEditor courseSubjectId={item.curso_disciplina_id} item={item} onDone={remote.reload} /></details> : null}
            <SoftDeleteControl deleted={Boolean(item.deleted_at)} id={item.id} label={item.nome} onDone={remote.reload} resource="caderno_catalogo" />
          </article>;
        })}</div>}
      </Section>
    </div>;
  }}</RemoteContent>;
}

function LessonEditor({ courseSubjectId, item, onDone }: { courseSubjectId: string; item?: CatalogLesson; onDone: () => void }) {
  const action = useRpcAction(onDone);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const total = asNumber(form, "total_questoes");
    const order = asNumber(form, "ordem");
    if (total < 0 || order < 0) {
      action.setFeedback({ kind: "error", text: "Total de questões e ordem não podem ser negativos." });
      return;
    }
    await action.run(() => callRpc("salvar_aula_catalogo", {
      p_id: item?.id ?? null,
      p_curso_disciplina_id: courseSubjectId,
      p_nome: asText(form, "nome"),
      p_ordem: order,
      p_link_tec: optionalText(form, "link_tec"),
      p_total_questoes: total,
      p_ativo: form.get("ativo") === "on",
    }), item ? "Aula atualizada." : "Aula adicionada ao catálogo.");
  }
  return <form className={styles.formGrid} onSubmit={save} key={item?.updated_at ?? courseSubjectId}>
    <Field label="Nome"><input className="be-input" name="nome" defaultValue={item?.nome ?? ""} required /></Field>
    <Field label="Link TEC"><input className="be-input" name="link_tec" type="url" defaultValue={item?.link_tec ?? ""} placeholder="https://…" /></Field>
    <Field label="Total de questões"><input className="be-input" name="total_questoes" type="number" min="0" defaultValue={item?.total_questoes ?? 0} required /></Field>
    <Field label="Ordem"><input className="be-input" name="ordem" type="number" min="0" defaultValue={item?.ordem ?? 0} required /></Field>
    <label className={styles.check}><input name="ativo" type="checkbox" defaultChecked={item?.ativo ?? true} /> Aula ativa</label>
    <div className={styles.formActions}><SubmitButton busy={action.busy}>{item ? "Salvar aula" : "Adicionar aula"}</SubmitButton></div>
    <Feedback state={action.feedback} />
  </form>;
}

function MaterialEditor({ item, lessonId, onDone }: { item?: LessonMaterial; lessonId: string; onDone: () => void }) {
  const action = useRpcAction(onDone);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = asText(form, "tipo") as MaterialKind;
    const url = optionalText(form, "url");
    if (kind !== "outro" && !url) {
      action.setFeedback({ kind: "error", text: "Informe a URL para materiais PDF, vídeo ou link." });
      return;
    }
    await action.run(() => callRpc("salvar_material_aula", {
      p_id: item?.id ?? null,
      p_aula_id: lessonId,
      p_tipo: kind,
      p_nome: asText(form, "nome"),
      p_url: url,
      p_ordem: asNumber(form, "ordem"),
    }), item ? "Material atualizado." : "Material adicionado à aula.");
  }
  return <form className={styles.formGrid} onSubmit={save} key={item?.updated_at ?? `${lessonId}-new-material`}>
    <Field label="Tipo"><select className="be-input" name="tipo" defaultValue={item?.tipo ?? "pdf"}><option value="pdf">PDF</option><option value="video">Vídeo</option><option value="link">Link</option><option value="outro">Outro</option></select></Field>
    <Field label="Nome"><input className="be-input" name="nome" defaultValue={item?.nome ?? ""} required /></Field>
    <Field label="URL"><input className="be-input" type="url" name="url" defaultValue={item?.url ?? ""} placeholder="Obrigatória, exceto para Outro" /></Field>
    <Field label="Ordem"><input className="be-input" type="number" min="0" name="ordem" defaultValue={item?.ordem ?? 0} required /></Field>
    <div className={styles.formActions}><SubmitButton busy={action.busy}>{item ? "Salvar material" : "Adicionar material"}</SubmitButton></div>
    <Feedback state={action.feedback} />
  </form>;
}

type LessonsData = {
  course: Course | null;
  lessons: CatalogLesson[];
  links: CourseSubject[];
  materials: LessonMaterial[];
  subjects: Subject[];
};

function CourseLessonsPage({ courseId }: { courseId: string }) {
  const loader = useCallback(async (): Promise<LessonsData> => {
    const [courses, subjects, links] = await Promise.all([loadCourses(), loadSubjects(), loadCourseSubjects(courseId)]);
    const linkIds = links.map((item) => item.id);
    let lessons: CatalogLesson[] = [];
    let materials: LessonMaterial[] = [];
    if (linkIds.length > 0) {
      const supabase = getSupabaseBrowserClient();
      lessons = await fetchAllRowsInBatches<CatalogLesson, string>(linkIds, (ids, from, to) => supabase
        .from("aulas_catalogo")
        .select("id,curso_disciplina_id,nome,ordem,link_tec,total_questoes,ativo,created_at,updated_at,deleted_at")
        .in("curso_disciplina_id", ids)
        .order("ordem", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to));
      const lessonIds = lessons.map((lesson) => lesson.id);
      if (lessonIds.length > 0) {
        materials = await fetchAllRowsInBatches<LessonMaterial, string>(lessonIds, (ids, from, to) => supabase
          .from("materiais_aula")
          .select("id,aula_id,tipo,nome,url,ordem,created_at,updated_at,deleted_at")
          .in("aula_id", ids)
          .order("ordem", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to));
      }
    }
    return { course: courses.find((course) => course.id === courseId) ?? null, subjects, links, lessons, materials };
  }, [courseId]);
  const remote = useRemoteData(loader);
  const [selectedLink, setSelectedLink] = useState("");

  return <RemoteContent remote={remote} skeleton="form">{(data) => {
    if (!data.course) return <EmptyPanel title="Curso não encontrado">O curso não existe ou não está visível.</EmptyPanel>;
    const subjects = new Map(data.subjects.map((subject) => [subject.id, subject]));
    const links = new Map(data.links.map((link) => [link.id, link]));
    const eligibleLinks = data.links.filter((link) => !link.deleted_at);
    const effectiveSelected = eligibleLinks.some((link) => link.id === selectedLink) ? selectedLink : eligibleLinks[0]?.id ?? "";
    const materialsByLesson = new Map<string, LessonMaterial[]>();
    for (const material of data.materials) {
      const current = materialsByLesson.get(material.aula_id) ?? [];
      current.push(material);
      materialsByLesson.set(material.aula_id, current);
    }

    return <div className={styles.stack}>
      <CourseContext course={data.course} current="aulas" />
      <Section title="Adicionar aula" description="A aula pertence a uma disciplina do curso e pode possuir vários materiais ordenados.">
        {eligibleLinks.length === 0 ? <EmptyPanel title="Associe uma disciplina primeiro">Aulas exigem uma disciplina vigente no curso.</EmptyPanel> : <>
          <Field label="Disciplina do curso"><select className="be-input" value={effectiveSelected} onChange={(event) => setSelectedLink(event.target.value)}>{eligibleLinks.map((link) => <option key={link.id} value={link.id}>{subjects.get(link.disciplina_id)?.nome ?? link.disciplina_id}</option>)}</select></Field>
          <LessonEditor courseSubjectId={effectiveSelected} onDone={remote.reload} />
        </>}
      </Section>

      <Section title="Aulas e materiais" description={`${data.lessons.length} aula(s) no catálogo.`}>
        {data.lessons.length === 0 ? <EmptyPanel title="Nenhuma aula">Adicione a primeira aula do curso.</EmptyPanel> : <div className={styles.recordCards}>{data.lessons.map((lesson) => {
          const link = links.get(lesson.curso_disciplina_id);
          const subject = link ? subjects.get(link.disciplina_id) : null;
          const materials = materialsByLesson.get(lesson.id) ?? [];
          return <article className={styles.recordCard} key={lesson.id}>
            <div className={styles.recordHeader}><div><span className={styles.code}>{subject?.nome ?? "Disciplina"} · ordem {lesson.ordem}</span><h3>{lesson.nome}</h3></div><Status value={lesson.deleted_at ? "excluido" : lesson.ativo ? "ativo" : "inativo"} /></div>
            <p>{lesson.total_questoes} questões {lesson.link_tec ? <>· <a className={styles.textLink} href={lesson.link_tec} target="_blank" rel="noreferrer">Abrir TEC</a></> : null}</p>
            {!lesson.deleted_at ? <details className={styles.detailsPanel}><summary>Editar aula</summary><LessonEditor courseSubjectId={lesson.curso_disciplina_id} item={lesson} onDone={remote.reload} /></details> : null}

            <div className={styles.subsection}>
              <h4>Materiais</h4>
              {materials.length === 0 ? <p className={styles.helper}>Nenhum material adicionado.</p> : <ul className={styles.materials}>{materials.map((material) => <li key={material.id}>
                <div><Status value={material.tipo} /><strong>{material.nome}</strong>{material.url ? <a className={styles.textLink} href={material.url} target="_blank" rel="noreferrer">Abrir</a> : null}</div>
                {!material.deleted_at ? <details className={styles.detailsPanel}><summary>Editar</summary><MaterialEditor item={material} lessonId={lesson.id} onDone={remote.reload} /></details> : <Status value="excluido" />}
                <SoftDeleteControl deleted={Boolean(material.deleted_at)} id={material.id} label={material.nome} onDone={remote.reload} resource="material_aula" />
              </li>)}</ul>}
              {!lesson.deleted_at ? <details className={styles.detailsPanel}><summary>Adicionar material</summary><MaterialEditor lessonId={lesson.id} onDone={remote.reload} /></details> : null}
            </div>
            <SoftDeleteControl deleted={Boolean(lesson.deleted_at)} id={lesson.id} label={lesson.nome} onDone={remote.reload} resource="aula_catalogo" />
          </article>;
        })}</div>}
      </Section>
    </div>;
  }}</RemoteContent>;
}

export function AdminCatalogRoutes({ route }: { route: ResolvedRoute }) {
  if (route.pathname === "catalogo/cursos") return <CoursesPage />;
  if (route.pathname === "catalogo/cursos/novo") return <NewCoursePage />;
  if (route.params.cursoId && route.pathname.endsWith("/resumo")) return <CourseSummaryPage key={route.params.cursoId} courseId={route.params.cursoId} />;
  if (route.params.cursoId && route.pathname.endsWith("/disciplinas")) return <CourseSubjectsPage key={route.params.cursoId} courseId={route.params.cursoId} />;
  if (route.params.cursoId && route.pathname.endsWith("/cadernos")) return <CourseNotebooksPage key={route.params.cursoId} courseId={route.params.cursoId} />;
  if (route.params.cursoId && route.pathname.endsWith("/aulas")) return <CourseLessonsPage key={route.params.cursoId} courseId={route.params.cursoId} />;
  if (route.pathname === "catalogo/disciplinas") return <SubjectsPage />;
  if (route.params.disciplinaId) return <SubjectDetailPage key={route.params.disciplinaId} subjectId={route.params.disciplinaId} />;
  return <EmptyPanel title="Rota de catálogo não implementada">A rota solicitada não pertence ao catálogo administrativo.</EmptyPanel>;
}
