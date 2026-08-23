import { Outlet } from "react-router";

export function PublicLayout() {
  return (
    <main className="auth">
      <Outlet />
    </main>
  );
}
