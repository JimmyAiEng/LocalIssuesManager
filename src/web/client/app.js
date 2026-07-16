import { clearActionState } from "./state.js";
import { handleClick, handleInput, handleKeydown, handleSubmit, pollTick, refresh, renderRoute } from "./handlers.js";

window.addEventListener("popstate", () => { clearActionState(); renderRoute(); });
document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleInput);
document.addEventListener("submit", handleSubmit);
document.addEventListener("keydown", handleKeydown);
setInterval(pollTick, 10_000);
refresh();
