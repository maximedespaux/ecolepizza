import { useContext } from "react";
import { ThemeContext } from "../context/ThemeContext.jsx";

/** Interrupteur soleil / lune. */
function ThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext);
  return (
    <button
      type="button"
      className={`theme-toggle ${theme}`}
      onClick={toggle}
      title="Changer de thème"
      aria-label="Changer de thème"
    >
      <span className="tt-ic tt-sun">☀</span>
      <span className="tt-ic tt-moon">☾</span>
      <span className="tt-knob" />
    </button>
  );
}

export default ThemeToggle;
