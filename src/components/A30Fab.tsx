import { useLocation, useNavigate } from "react-router-dom";
import A30Icon from "./A30Icon";

// Pages où le bouton ne s'affiche pas
const HIDDEN_ON = ["/login", "/register", "/a30-ia"];

export default function A30Fab() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (HIDDEN_ON.includes(pathname)) return null;

  return (
    <button
      onClick={() => navigate("/a30-ia")}
      aria-label="Ouvrir A30 IA"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white hover:bg-orange-600 active:scale-95"
    >
      <A30Icon className="h-7 w-7" />
      <span className="absolute -right-1 -top-1 rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
        IA
      </span>
    </button>
  );
}