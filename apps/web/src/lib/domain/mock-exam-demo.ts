/** Nomes ilustrativos exclusivos do simulado local de demonstração. */
export const DEMO_MOCK_EXAM_ID = "99999999-0002-4000-8000-000000000001";
const demoNames: Readonly<Record<number, string>> = {
  93: "Lucas Almeida", 89: "Mariana Santos", 84: "Rafael Oliveira", 75: "Ana Costa",
  72: "Pedro Lima", 69: "Camila Souza", 65: "Bruno Ferreira", 61: "Juliana Rocha",
  57: "Diego Martins", 52: "Beatriz Silva", 47: "Felipe Gomes", 42: "Larissa Pereira",
};
export const demoMockExamName = (examId: string, score: number | null, fallback: string) =>
  examId === DEMO_MOCK_EXAM_ID && score !== null ? demoNames[score] ?? "Participante fictício" : fallback;
