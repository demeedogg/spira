import { getCurrentWindow } from "@tauri-apps/api/window";
import { emitTo } from "@tauri-apps/api/event";
import "./help.css";

const helpWindow = getCurrentWindow();
async function closeHelp() {
  await helpWindow.hide();
  await emitTo("main", "help-closed");
}

document.querySelector("#close")!.addEventListener("click", closeHelp);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.key === "?" || event.key === "F1") {
    event.preventDefault();
    void closeHelp();
  }
});
