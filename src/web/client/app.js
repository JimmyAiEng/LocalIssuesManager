import { clearActionState } from "./state.js";
import { handleClick, handleInput, handleKeydown, handleSubmit, handleToggle, pollTick, refresh, renderRoute } from "./handlers.js";

window.addEventListener("popstate", () => { clearActionState(); renderRoute(); });
document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleInput);
document.addEventListener("submit", handleSubmit);
document.addEventListener("keydown", handleKeydown);
document.addEventListener("toggle", handleToggle, true); // toggle não borbulha: só chega por captura
setInterval(pollTick, 10_000);
refresh();
