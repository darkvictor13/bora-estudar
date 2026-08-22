"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import {
  courseCodeFromName,
  courseNameFromFileName,
  parseCourseCsv,
  type CourseCsvResult,
} from "@/lib/domain/courseCsvImport";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import {
  backendMessage,
  Field,
  Feedback,
  loadSubjects,
  RemoteContent,
  Section,
  SubmitButton,
  useRemoteData,
  type CoursePhase,
  type FeedbackState,
  type StudyModel,
  type Subject,
} from "./shared";
import adminStyles from "../AdminDomainPage.module.css";
import styles from "./AdminCourseImportRoute.module.css";

type DisciplineGroup = {
  key: string;
  mode: "existing" | "new";
  disciplineId: string | null;
  code: string;
  name: string;
};

type CourseFormState = {
  code: string;
  name: string;
  area: string;
  target: string;
  phase: CoursePhase;
  studyModel: StudyModel;
  weeklyGoals: number;
};

const initialCourse: CourseFormState = {
  code: "",
  name: "",
  area: "",
  target: "",
  phase: "pre_edital",
  studyModel: "teoria_blocos",
  weeklyGoals: 24,
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function groupLabel(group: DisciplineGroup) {
  return group.name || group.code || "Disciplina sem nome";
}

function groupsFromCsv(parsed: CourseCsvResult, subjects: Subject[]) {
  const groups: DisciplineGroup[] = [];
  const assignments: Record<number, string> = {};
  const bySourceName = new Map<string, DisciplineGroup>();
  const byTargetKey = new Map<string, DisciplineGroup>();

  for (const notebook of parsed.notebooks) {
    if (!notebook.discipline) continue;
    const sourceKey = normalized(notebook.discipline);
    let group = bySourceName.get(sourceKey);
    if (!group) {
      const existing = subjects.find((subject) =>
        !subject.deleted_at
        && subject.ativo
        && (normalized(subject.nome) === sourceKey || normalized(subject.codigo) === sourceKey));
      if (existing) {
        const targetKey = `existing:${existing.id}`;
        group = byTargetKey.get(targetKey) ?? {
          key: `existing:${existing.id}`,
          mode: "existing",
          disciplineId: existing.id,
          code: existing.codigo,
          name: existing.nome,
        };
        byTargetKey.set(targetKey, group);
      } else {
        const baseCode = courseCodeFromName(notebook.discipline) || `DISCIPLINA-${groups.length + 1}`;
        let code = baseCode;
        let suffix = 2;
        while (groups.some((item) => normalized(item.code) === normalized(code))) {
          code = `${baseCode}-${suffix}`;
          suffix += 1;
        }
        group = {
          key: `new:csv:${groups.length}`,
          mode: "new",
          disciplineId: null,
          code,
          name: notebook.discipline,
        };
      }
      if (!group) throw new Error("Não foi possível organizar a disciplina informada no CSV.");
      const resolvedGroup = group;
      if (!groups.some((item) => item.key === resolvedGroup.key)) groups.push(resolvedGroup);
      bySourceName.set(sourceKey, resolvedGroup);
    }
    assignments[notebook.rowNumber] = group.key;
  }

  return { groups, assignments };
}

export function AdminCourseImportRoute() {
  const loader = useCallback(() => loadSubjects(), []);
  const subjectsRemote = useRemoteData(loader);

  return <RemoteContent remote={subjectsRemote} skeleton="form">{(subjects) => (
    <CourseImportForm subjects={subjects.filter((subject) => subject.ativo && !subject.deleted_at)} />
  )}</RemoteContent>;
}

function CourseImportForm({ subjects }: { subjects: Subject[] }) {
  const [parsed, setParsed] = useState<CourseCsvResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [course, setCourse] = useState(initialCourse);
  const [groups, setGroups] = useState<DisciplineGroup[]>([]);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [selectedExisting, setSelectedExisting] = useState("");
  const [newDiscipline, setNewDiscipline] = useState({ code: "", name: "" });
  const [range, setRange] = useState({ first: 2, last: 2, groupKey: "" });
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [busy, setBusy] = useState(false);
  const [importedCourseId, setImportedCourseId] = useState("");

  const assignedCount = useMemo(() => {
    if (!parsed) return 0;
    return parsed.notebooks.filter((notebook) => Boolean(assignments[notebook.rowNumber])).length;
  }, [assignments, parsed]);

  const usedGroups = useMemo(() => new Set(Object.values(assignments)), [assignments]);

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    setImportedCourseId("");

    try {
      if (!file.name.toLocaleLowerCase("pt-BR").endsWith(".csv")) {
        throw new Error("Selecione um arquivo com extensão .csv.");
      }
      const result = parseCourseCsv(new Uint8Array(await file.arrayBuffer()));
      const suggestedName = courseNameFromFileName(file.name);
      const initialized = groupsFromCsv(result, subjects);
      const firstRow = result.notebooks[0].rowNumber;
      const lastRow = result.notebooks[result.notebooks.length - 1].rowNumber;

      setParsed(result);
      setFileName(file.name);
      setCourse({
        ...initialCourse,
        name: suggestedName,
        target: suggestedName,
        code: courseCodeFromName(suggestedName),
      });
      setGroups(initialized.groups);
      setAssignments(initialized.assignments);
      setRange({ first: firstRow, last: lastRow, groupKey: initialized.groups[0]?.key ?? "" });
    } catch (reason) {
      setParsed(null);
      setFileName("");
      setGroups([]);
      setAssignments({});
      setFeedback({ kind: "error", text: reason instanceof Error ? reason.message : "Não foi possível ler o CSV." });
      event.target.value = "";
    }
  }

  function addExistingGroup() {
    const subject = subjects.find((item) => item.id === selectedExisting);
    if (!subject) return;
    const key = `existing:${subject.id}`;
    if (groups.some((group) => group.key === key)) {
      setFeedback({ kind: "error", text: "Essa disciplina já está disponível na organização do arquivo." });
      return;
    }
    setGroups((current) => [...current, {
      key,
      mode: "existing",
      disciplineId: subject.id,
      code: subject.codigo,
      name: subject.nome,
    }]);
    setRange((current) => ({ ...current, groupKey: key }));
    setSelectedExisting("");
    setFeedback(null);
  }

  function addNewGroup() {
    const code = newDiscipline.code.trim();
    const name = newDiscipline.name.trim();
    if (!code || !name) {
      setFeedback({ kind: "error", text: "Informe código e nome para criar uma disciplina durante a importação." });
      return;
    }
    if (groups.some((group) => normalized(group.code) === normalized(code))) {
      setFeedback({ kind: "error", text: "Já existe uma disciplina com esse código na organização do arquivo." });
      return;
    }
    if (subjects.some((subject) => normalized(subject.codigo) === normalized(code))) {
      setFeedback({ kind: "error", text: "Esse código já pertence a uma disciplina do catálogo. Reutilize a disciplina existente." });
      return;
    }
    const key = `new:manual:${Date.now()}`;
    setGroups((current) => [...current, { key, mode: "new", disciplineId: null, code, name }]);
    setRange((current) => ({ ...current, groupKey: key }));
    setNewDiscipline({ code: "", name: "" });
    setFeedback(null);
  }

  function removeGroup(key: string) {
    setGroups((current) => current.filter((group) => group.key !== key));
    setAssignments((current) => Object.fromEntries(
      Object.entries(current).filter(([, groupKey]) => groupKey !== key),
    ));
    setRange((current) => ({ ...current, groupKey: current.groupKey === key ? "" : current.groupKey }));
  }

  function assignRange() {
    if (!parsed || !range.groupKey) {
      setFeedback({ kind: "error", text: "Selecione uma disciplina para atribuir o intervalo." });
      return;
    }
    if (range.first > range.last) {
      setFeedback({ kind: "error", text: "A primeira linha do intervalo não pode ser maior que a última." });
      return;
    }
    setAssignments((current) => {
      const next = { ...current };
      for (const notebook of parsed.notebooks) {
        if (notebook.rowNumber >= range.first && notebook.rowNumber <= range.last) {
          next[notebook.rowNumber] = range.groupKey;
        }
      }
      return next;
    });
    setFeedback(null);
  }

  async function importCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed) {
      setFeedback({ kind: "error", text: "Selecione e valide um CSV antes de importar." });
      return;
    }
    if (assignedCount !== parsed.notebooks.length) {
      setFeedback({ kind: "error", text: "Todos os cadernos precisam estar associados a uma disciplina." });
      return;
    }

    const orderedGroups = groups
      .filter((group) => usedGroups.has(group.key))
      .map((group) => ({
        group,
        firstRow: Math.min(...parsed.notebooks
          .filter((notebook) => assignments[notebook.rowNumber] === group.key)
          .map((notebook) => notebook.rowNumber)),
      }))
      .sort((left, right) => left.firstRow - right.firstRow);

    if (orderedGroups.some(({ group }) => !group.code.trim() || !group.name.trim())) {
      setFeedback({ kind: "error", text: "Todas as disciplinas usadas precisam ter código e nome." });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const payload = orderedGroups.map(({ group }) => ({
        disciplina_id: group.disciplineId,
        codigo: group.code.trim(),
        nome: group.name.trim(),
        cadernos: parsed.notebooks
          .filter((notebook) => assignments[notebook.rowNumber] === group.key)
          .map((notebook) => ({
            nome: notebook.name,
            link_tec: notebook.link || null,
            total_questoes: notebook.totalQuestions,
          })),
      }));

      const { data, error } = await getSupabaseBrowserClient().rpc("importar_curso_csv", {
        p_codigo: course.code.trim(),
        p_nome: course.name.trim(),
        p_area: course.area.trim() || null,
        p_concurso_alvo: course.target.trim() || null,
        p_fase: course.phase,
        p_modelo_estudo: course.studyModel,
        p_metas_semanais_padrao: course.weeklyGoals,
        p_disciplinas: payload,
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || !("curso_id" in data) || typeof data.curso_id !== "string") {
        throw new Error("O Supabase concluiu a operação, mas não retornou o curso criado.");
      }
      setImportedCourseId(data.curso_id);
      setFeedback({
        kind: "success",
        text: `Curso importado com ${orderedGroups.length} disciplina(s) e ${parsed.notebooks.length} caderno(s).`,
      });
    } catch (reason) {
      setFeedback({ kind: "error", text: backendMessage(reason) });
    } finally {
      setBusy(false);
    }
  }

  return <form className={adminStyles.stack} onSubmit={importCourse}>
    <Section
      title="Importar curso por CSV"
      description="Crie o curso, associe as disciplinas e importe todos os cadernos em uma única operação."
      actions={<Link className="be-button be-button--ghost" href="/admin/catalogo/cursos">Voltar aos cursos</Link>}
    >
      <label className={styles.dropzone}>
        <span className={styles.dropzoneTitle}>{fileName || "Selecionar arquivo CSV"}</span>
        <span>Formato aceito: Data, Nome, Link, Total, Resolvidas, Acertos, Erros e, opcionalmente, Disciplina.</span>
        <input accept=".csv,text/csv" onChange={readFile} type="file" />
      </label>
      <p className={adminStyles.helper}>Nome, Link e Total formam o catálogo. Data, Resolvidas, Acertos e Erros representam o histórico da exportação e não são copiados para um curso novo.</p>
      {parsed ? <div className={styles.summary} aria-live="polite">
        <div><strong>{parsed.notebooks.length}</strong><span>cadernos lidos</span></div>
        <div><strong>{assignedCount}</strong><span>classificados</span></div>
        <div><strong>{groups.filter((group) => usedGroups.has(group.key)).length}</strong><span>disciplinas usadas</span></div>
        <div><strong>{parsed.encoding}</strong><span>codificação</span></div>
      </div> : null}
      {parsed?.warnings.map((warning) => <p className={adminStyles.note} key={warning}>{warning}</p>)}
    </Section>

    {parsed ? <>
      <Section title="Dados do novo curso" description="Revise os valores sugeridos a partir do nome do arquivo.">
        <div className={adminStyles.formGrid}>
          <Field label="Código"><input className="be-input" required value={course.code} onChange={(event) => setCourse({ ...course, code: event.target.value })} /></Field>
          <Field label="Nome"><input className="be-input" required value={course.name} onChange={(event) => setCourse({ ...course, name: event.target.value })} /></Field>
          <Field label="Área"><input className="be-input" value={course.area} onChange={(event) => setCourse({ ...course, area: event.target.value })} /></Field>
          <Field label="Concurso-alvo"><input className="be-input" value={course.target} onChange={(event) => setCourse({ ...course, target: event.target.value })} /></Field>
          <Field label="Fase"><select className="be-input" value={course.phase} onChange={(event) => setCourse({ ...course, phase: event.target.value as CoursePhase })}><option value="pre_edital">Pré-edital</option><option value="pos_edital">Pós-edital</option></select></Field>
          <Field label="Modelo de estudo"><select className="be-input" value={course.studyModel} onChange={(event) => setCourse({ ...course, studyModel: event.target.value as StudyModel })}><option value="teoria_blocos">Teoria e blocos</option><option value="somente_blocos">Somente blocos</option></select></Field>
          <Field label="Metas semanais padrão"><input className="be-input" min="1" max="100" required type="number" value={course.weeklyGoals} onChange={(event) => setCourse({ ...course, weeklyGoals: Number(event.target.value) })} /></Field>
        </div>
      </Section>

      <Section title="Organizar disciplinas" description="Reutilize disciplinas do catálogo ou crie novas. Depois, atribua intervalos ou ajuste linhas individualmente.">
        <div className={styles.disciplineCreator}>
          <div className={styles.creatorBlock}>
            <h3>Reutilizar disciplina</h3>
            <div className={styles.inlineFields}>
              <select aria-label="Disciplina existente" className="be-input" value={selectedExisting} onChange={(event) => setSelectedExisting(event.target.value)}>
                <option value="">Selecione no catálogo</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.nome} ({subject.codigo})</option>)}
              </select>
              <button className="be-button" disabled={!selectedExisting} onClick={addExistingGroup} type="button">Adicionar</button>
            </div>
          </div>
          <div className={styles.creatorBlock}>
            <h3>Criar disciplina</h3>
            <div className={styles.inlineFields}>
              <input aria-label="Código da nova disciplina" className="be-input" placeholder="Código" value={newDiscipline.code} onChange={(event) => setNewDiscipline({ ...newDiscipline, code: event.target.value })} />
              <input aria-label="Nome da nova disciplina" className="be-input" placeholder="Nome" value={newDiscipline.name} onChange={(event) => setNewDiscipline({ ...newDiscipline, name: event.target.value })} />
              <button className="be-button" onClick={addNewGroup} type="button">Adicionar</button>
            </div>
          </div>
        </div>

        {groups.length > 0 ? <div className={styles.groupChips}>{groups.map((group) => <div className={styles.groupChip} key={group.key}>
          <span>{groupLabel(group)}</span>
          <small>{group.mode === "existing" ? "Catálogo" : `Nova · ${group.code}`}</small>
          <button aria-label={`Remover ${groupLabel(group)}`} onClick={() => removeGroup(group.key)} type="button">×</button>
        </div>)}</div> : <p className={adminStyles.helper}>Adicione ao menos uma disciplina para começar a classificação.</p>}

        <div className={styles.rangeEditor}>
          <Field label="Da linha"><input className="be-input" min="2" type="number" value={range.first} onChange={(event) => setRange({ ...range, first: Number(event.target.value) })} /></Field>
          <Field label="Até a linha"><input className="be-input" min="2" type="number" value={range.last} onChange={(event) => setRange({ ...range, last: Number(event.target.value) })} /></Field>
          <Field label="Disciplina"><select className="be-input" value={range.groupKey} onChange={(event) => setRange({ ...range, groupKey: event.target.value })}><option value="">Selecione</option>{groups.map((group) => <option key={group.key} value={group.key}>{groupLabel(group)}</option>)}</select></Field>
          <button className="be-button be-button--primary" onClick={assignRange} type="button">Atribuir intervalo</button>
        </div>
      </Section>

      <Section title="Pré-visualização" description={`${assignedCount} de ${parsed.notebooks.length} cadernos associados a uma disciplina.`}>
        <div className={styles.previewTable}>
          <table className="be-table">
            <thead><tr><th>Linha</th><th>Caderno</th><th>Questões</th><th>Disciplina</th></tr></thead>
            <tbody>{parsed.notebooks.map((notebook) => <tr data-unassigned={!assignments[notebook.rowNumber] || undefined} key={notebook.rowNumber}>
              <td>{notebook.rowNumber}</td>
              <td><strong>{notebook.name}</strong><small>{notebook.date || "Data não informada"}</small></td>
              <td>{notebook.totalQuestions}</td>
              <td><select aria-label={`Disciplina da linha ${notebook.rowNumber}`} className="be-input" value={assignments[notebook.rowNumber] ?? ""} onChange={(event) => setAssignments({ ...assignments, [notebook.rowNumber]: event.target.value })}><option value="">Sem disciplina</option>{groups.map((group) => <option key={group.key} value={group.key}>{groupLabel(group)}</option>)}</select></td>
            </tr>)}</tbody>
          </table>
        </div>
      </Section>

      <Section title="Confirmar importação" description="A operação é atômica e não altera planejamentos já existentes.">
        <div className={styles.confirmRow}>
          <p>{assignedCount === parsed.notebooks.length ? "Tudo pronto para criar o curso." : `Classifique mais ${parsed.notebooks.length - assignedCount} caderno(s).`}</p>
          <SubmitButton busy={busy} busyLabel="Importando…" disabled={assignedCount !== parsed.notebooks.length || Boolean(importedCourseId)}>Importar curso</SubmitButton>
        </div>
        <Feedback state={feedback} />
        {importedCourseId ? <div className={adminStyles.nextStep} role="status">
          <strong>Importação concluída.</strong>
          <span>O novo catálogo já pode ser revisado e usado em planejamentos.</span>
          <Link className="be-button be-button--primary" href={`/admin/catalogo/cursos/${importedCourseId}/resumo`}>Administrar curso</Link>
        </div> : null}
      </Section>
    </> : <Feedback state={feedback} />}
  </form>;
}
