const inputId = document.getElementById("discordId");
const inputUrl = document.getElementById("serverUrl");
const statusEl = document.getElementById("status"); // ajouté pour éviter les erreurs

// Charger les valeurs sauvegardées
chrome.storage.local.get(["discord_id"], (data) => {
  if (data.discord_id) inputId.value = data.discord_id;
});

document.getElementById("save").onclick = () => {
  const id = inputId.value.trim();

  if (!/^\d{17,20}$/.test(id)) {
    statusEl.textContent = "ID Discord invalide";
    return;
  }

  chrome.storage.local.set({ discord_id: id }, () => {
    statusEl.textContent = "Sauvegardé ✓";
    console.log("ID Discord :", id);
  });
};

