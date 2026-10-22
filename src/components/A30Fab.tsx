import { Link, useLocation } from "react-router-dom";

const HIDDEN_ON = ["/a30-ia", "/login", "/register"];

export default function A30Fab() {
  const { pathname } = useLocation();
  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <Link
      to="/a30-ia"
      aria-label="Ouvrir A30 IA"
      className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 md:bottom-6"
    >
      A30
    </Link>
  );
}
