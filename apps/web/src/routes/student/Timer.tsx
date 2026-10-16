import Box from "@mui/material/Box";
import { useNavigate } from "react-router";

import { StudyTimerFocus } from "@/components/StudyTimer";
import { requireStudentAccess } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

export async function timerLoader({ request }: { request: Request }) {
  await requireStudentAccess(request);
  return null;
}

export function Timer() {
  const navigate = useNavigate();

  return (
    <Box sx={{ position: "fixed", inset: 0, zIndex: 2000, bgcolor: "#1F2423", overflowY: "auto" }}>
      {/* A tela não tem título visível; o h1 dá à página um nome para quem navega por títulos (QA2-B05). */}
      <Box
        component="h1"
        sx={{ position: "absolute", width: 1, height: 1, m: -0.125, p: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}
      >
        Cronômetro de estudo
      </Box>
      <StudyTimerFocus fullscreen onClose={() => navigate(ROUTES.student.overview)} />
    </Box>
  );
}
