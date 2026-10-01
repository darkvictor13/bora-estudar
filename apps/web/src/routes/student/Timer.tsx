import Box from "@mui/material/Box";
import { useNavigate } from "react-router";

import { StudyTimerFocus } from "@/components/StudyTimer";
import { requireStudentAccess } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

export async function timerLoader() {
  await requireStudentAccess();
  return null;
}

export function Timer() {
  const navigate = useNavigate();

  return (
    <Box sx={{ position: "fixed", inset: 0, zIndex: 2000, bgcolor: "#1F2423", overflowY: "auto" }}>
      <StudyTimerFocus fullscreen onClose={() => navigate(ROUTES.student.overview)} />
    </Box>
  );
}
