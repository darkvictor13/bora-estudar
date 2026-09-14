import CheckIcon from "@mui/icons-material/CheckOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVertOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Badge, type BadgeTone } from "@bora/ui";
import { useState } from "react";

import type { Goal, GoalStatus, GoalType } from "@/lib/api";
import { formatMinutes } from "@/lib/domain/week";

/** O que cada estado da meta diz, e em que cor. */
const STATUS: Record<GoalStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pendente", tone: "neutral" },
  in_progress: { label: "Em andamento", tone: "accent" },
  completed: { label: "Concluída", tone: "success" },
  // Pulada é AVISO, não erro: pular é uma decisão legítima de quem está
  // estudando, e pintá-la de vermelho transformaria escolha em repreensão.
  skipped: { label: "Pulada", tone: "warning" },
};

const TYPE_LABEL: Record<GoalType, string> = {
  theory: "Teoria",
  question_block: "Bateria",
  review: "Revisão",
  reinforcement: "Reforço",
  mock_exam: "Simulado",
  extra: "Extra",
};

export interface GoalActions {
  onRecord: (goal: Goal) => void;
  /** Só para meta de teoria com aula resolvida no catálogo. */
  onOpenTheory: (goal: Goal) => void;
  onComplete: (goal: Goal) => void;
  onReopen: (goal: Goal) => void;
  onSkip: (goal: Goal) => void;
}

/**
 * Uma linha de meta — o `task-row` da v2.
 *
 * A CAIXA DE SELEÇÃO É UM BOTÃO, e conclui. Na v2 ela era um `<div class="cb">`
 * com `onclick`: parecia caixa de seleção, não era anunciada como uma, e não
 * respondia ao teclado. Aqui é `<button>` com `aria-pressed`, que é o que um
 * controle de dois estados anuncia.
 *
 * META DE BATERIA NÃO TEM AÇÃO. O resultado dela é do motor de baterias, que
 * saiu com a extensão e ainda não voltou; o gatilho `protect_goal_quiz_result`
 * recusa a escrita no banco. Oferecer o botão e falhar depois seria pior do que
 * explicar antes.
 */
export function GoalRow({ goal, actions }: { goal: Goal; actions: GoalActions }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const done = goal.status === "completed";
  const isQuiz = goal.type === "question_block";

  const score =
    goal.questionsAnswered > 0
      ? Math.round((goal.correctAnswers / goal.questionsAnswered) * 100)
      : null;

  const detail = [
    goal.subject,
    goal.lesson ?? goal.block,
    goal.spentMinutes > 0
      ? `${formatMinutes(goal.spentMinutes)} de ${formatMinutes(goal.plannedMinutes)}`
      : formatMinutes(goal.plannedMinutes),
    score === null ? null : `${score}% de acerto`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box
      data-testid="goal-row"
      data-goal-id={goal.id}
      data-status={goal.status}
      data-type={goal.type}
      sx={(theme) => ({
        display: "grid",
        gridTemplateColumns: "22px 1fr auto",
        gap: 1.25,
        alignItems: "center",
        py: 1.25,
        borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
        "&:last-of-type": { borderBottom: "none" },
        [theme.breakpoints.down("md")]: {
          gridTemplateColumns: "22px 1fr",
          '& [data-testid="goal-actions"]': { gridColumn: "2 / -1" },
        },
      })}
    >
      <Tooltip title={isQuiz ? "" : done ? "Reabrir meta" : "Concluir meta"}>
        <Box
          component="span"
          sx={{ display: "inline-flex" }}
          // Um <span> em volta porque o Tooltip precisa de um alvo que receba
          // eventos, e um <button disabled> não recebe nenhum.
        >
          <IconButton
            size="small"
            data-testid="goal-check"
            aria-label={done ? `Reabrir ${goal.title}` : `Concluir ${goal.title}`}
            aria-pressed={done}
            disabled={isQuiz}
            onClick={() => (done ? actions.onReopen(goal) : actions.onComplete(goal))}
            sx={(theme) => ({
              width: 22,
              height: 22,
              borderRadius: `${theme.brand.radius.xs}px`,
              border: `1.5px solid ${
                done ? theme.vars.palette.success.main : theme.vars.palette.surface.controlBorder
              }`,
              backgroundColor: done ? theme.vars.palette.success.main : "transparent",
              color: done ? theme.vars.palette.success.contrastText : "transparent",
              "&:hover": {
                backgroundColor: done
                  ? theme.vars.palette.success.main
                  : theme.vars.palette.surface.hover,
              },
            })}
          >
            <CheckIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Box>
      </Tooltip>

      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="p"
          sx={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            textDecoration: done ? "line-through" : "none",
            opacity: done ? 0.7 : 1,
          }}
        >
          {goal.title}
        </Typography>
        <Typography variant="caption" component="p" sx={{ mt: 0.125 }}>
          {detail}
        </Typography>
      </Box>

      <Box
        data-testid="goal-actions"
        sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}
      >
        {/* O TIPO É SEMPRE NEUTRO. A cor da linha já é gasta pelo ESTADO, que é
            o que muda e o que a pessoa procura; pintar o tipo também faria duas
            etiquetas coloridas disputando a mesma leitura. */}
        <Badge tone="neutral">{TYPE_LABEL[goal.type]}</Badge>
        <Badge tone={STATUS[goal.status].tone}>{STATUS[goal.status].label}</Badge>

        {isQuiz ? (
          <Tooltip title="O motor de baterias está sendo reescrito. Esta meta ainda não pode ser registrada pela tela.">
            <Typography variant="caption" data-testid="goal-blocked">
              Bateria indisponível
            </Typography>
          </Tooltip>
        ) : (
          <>
            {/*
              META DE TEORIA COM AULA NO CATÁLOGO ABRE O FLUXO, não o formulário
              genérico. É a mudança central da v108.2: registrar minutos numa
              meta de teoria perde a página em que a pessoa parou, e é a página
              que faz a meta da semana seguinte continuar de onde esta acabou.
            */}
            {goal.type === "theory" && goal.theory ? (
              <Button
                size="small"
                variant="contained"
                data-testid="goal-theory"
                onClick={() => actions.onOpenTheory(goal)}
              >
                Estudar teoria
              </Button>
            ) : null}
            <Button size="small" variant="outlined" onClick={() => actions.onRecord(goal)}>
              Registrar
            </Button>
            <IconButton
              size="small"
              aria-label={`Mais ações para ${goal.title}`}
              onClick={(event) => setMenu(event.currentTarget)}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
              {done ? (
                <MenuItem
                  onClick={() => {
                    setMenu(null);
                    actions.onReopen(goal);
                  }}
                >
                  Reabrir meta
                </MenuItem>
              ) : (
                <MenuItem
                  onClick={() => {
                    setMenu(null);
                    actions.onComplete(goal);
                  }}
                >
                  Concluir meta
                </MenuItem>
              )}
              <MenuItem
                disabled={goal.status === "skipped"}
                onClick={() => {
                  setMenu(null);
                  actions.onSkip(goal);
                }}
              >
                Pular meta
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>
    </Box>
  );
}
