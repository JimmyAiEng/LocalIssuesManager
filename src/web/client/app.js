import { clearActionState } from "./state.js";
import { handleClick, handleInput, handleSubmit, refresh, renderRoute } from "./handlers.js";

window.addEventListener("popstate", () => { clearActionState(); renderRoute(); });
document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleInput);
document.addEventListener("submit", handleSubmit);
refresh();
