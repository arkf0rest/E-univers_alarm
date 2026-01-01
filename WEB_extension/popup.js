const inputId = document.getElementById("discordId");
const statusEl = document.getElementById("status"); // ajouté pour éviter les erreurs
const checkbox = document.getElementById("checkboxInput");

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

checkbox.addEventListener("change", () => {
  if (checkbox.checked) {
    console.log("🔊 Son activé");
  } else {
    console.log("🔇 Son coupé");
  }
  chrome.storage.local.set({audioEnable: checkbox.checked})
});

chrome.storage.local.get(["audioEnable"], (data) => {
  checkbox.checked = Boolean(data.audioEnable);
});


