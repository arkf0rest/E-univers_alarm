let isReady = true;
let offscreenReady = false;
let lastSoundTime = 0;
const SOUND_COOLDOWN = 10_000; // 10 secondes

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("check_api", { periodInMinutes: 0.5 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("check_api", { periodInMinutes: 0.5 });
});

// Récupération de l'URL du serveur
fetch("https://raw.githubusercontent.com/arkf0rest/E-univers_alarm/main/server.json")
  .then(res => res.json())
  .then(data => {
    chrome.storage.local.set({ server_url: data.url });
    console.log("URL du serveur mise à jour :", data.url);
  })
  .catch(err => console.error("Impossible de récupérer server.json", err));

// Fonction pour décoder le JWT sans dépendance externe
function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch (e) {
    return null;
  }
}

// Fonction pour récupérer un token valide
async function getToken() {
  const storage = await chrome.storage.local.get(["token", "expiry"]);
  let { token, expiry } = storage;

  // Vérifier si le token existe et n'est pas expiré
  if (!token || !expiry || Date.now() >= expiry) {
    const { server_url } = await chrome.storage.local.get(["server_url"]);
    if (!server_url) throw new Error("server_url manquant");

    const res = await fetch(`${server_url}/get_token`, {
      headers: {
        "X-EXTENSION-SECRET":
          "aKF7UiBihUenjFgme_5LgHcxHiirH4pX3KmbyebU5scoCjwsdpnx0NdQyFyb0v9XnHA"
      }
    });

    const data = await res.json();
    token = data.token;

    const decoded = decodeJWT(token);
    expiry = decoded?.exp ? decoded.exp * 1000 : Date.now() + 3600000;

    await chrome.storage.local.set({ token, expiry });
    console.log(
      "✅ Nouveau token récupéré, expire à",
      new Date(expiry).toLocaleTimeString()
    );
  }

  return token;
}

async function checkAttacks() {
  try {
    const res = await fetch("https://e-univers.fr/FONCTIONS/FLOTTES/get_fleets.php?serveur_id=3", {
      credentials: "include"
    });
    if (!res.ok) return false;

    const text = await res.text(); // lire le corps en texte
    const jsonStart = text.indexOf('{'); // trouver le début du JSON
    const jsonData = JSON.parse(text.slice(jsonStart)); // parser le JSON

    return jsonData.missions?.some(m => m.mission_type === "attaquer") || false;

  } catch (err) {
    console.error("Erreur checkAttacks:", err);
    return false;
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "check_api") return;

  const attaque = await checkAttacks();
  console.log("Attaque détectée :", attaque);

  if (attaque && isReady) {
    isReady = false;

    const { discord_id, server_url } = await chrome.storage.local.get(["discord_id", "server_url"]);
    if (!discord_id || !server_url) return;

    const token = await getToken();

    fetch(`${server_url}/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        message: "⚠️ Une attaque est en cours.",
        discord_id
      })
    }).catch(console.error);

    const { audioEnable } = await chrome.storage.local.get(["audioEnable"]);

    if (audioEnable) {
      playOffscreenSound(); // 🔊 Jouer le son directement
    };

  }

  if (!attaque) {
    isReady = true; // réarmement
  }
});

// --- OFFSCREEN AUDIO ---
async function ensureOffscreen() {
  if (offscreenReady) return;

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play alert sound"
  });

  await new Promise(r => setTimeout(r, 500));
  offscreenReady = true;
}

async function playOffscreenSound() {
  const now = Date.now();
  if (now - lastSoundTime < SOUND_COOLDOWN) return; // anti-spam
  lastSoundTime = now;

  await ensureOffscreen();
  chrome.runtime.sendMessage({ action: "offscreen-play-sound" });
}

