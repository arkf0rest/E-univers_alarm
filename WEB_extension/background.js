let isReadyAttack = true;
let isReadyExpe = false;
let offscreenReady = false;
let lastSoundTime = 0;
const SOUND_COOLDOWN = 10_000; // 10 secondes
const CHECK_INTERVAL = 3000; // 3 secondes

// --- Récupération de l'URL du serveur ---
fetch("https://raw.githubusercontent.com/arkf0rest/E-univers_alarm/main/server.json")
  .then(res => res.json())
  .then(data => {
    chrome.storage.local.set({ server_url: data.url });
    console.log("URL du serveur mise à jour :", data.url);
  })
  .catch(err => console.error("Impossible de récupérer server.json", err));

// --- Décodage JWT ---
function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch (e) {
    return null;
  }
}

// --- Récupération d'un token valide ---
async function getToken() {
  const storage = await chrome.storage.local.get(["token", "expiry"]);
  let { token, expiry } = storage;

  if (!token || !expiry || Date.now() >= expiry) {
    const { server_url } = await chrome.storage.local.get(["server_url"]);
    if (!server_url) throw new Error("server_url manquant");

    const res = await fetch(`${server_url}/get_token`, {
      headers: { "X-EXTENSION-SECRET": "aKF7UiBihUenjFgme_5LgHcxHiirH4pX3KmbyebU5scoCjwsdpnx0NdQyFyb0v9XnHA",
                  "ngrok-skip-browser-warning": "true"
       }
    });

    const data = await res.json();
    token = data.token;
    const decoded = decodeJWT(token);
    expiry = decoded?.exp ? decoded.exp * 1000 : Date.now() + 3600000;
    await chrome.storage.local.set({ token, expiry });

    console.log("✅ Nouveau token récupéré, expire à", new Date(expiry).toLocaleTimeString());
  }

  return token;
}

// --- Récupération des flottes ---
async function getFleets() {
  try {
    const res = await fetch("https://e-univers.fr/FONCTIONS/FLOTTES/get_fleets.php?serveur_id=3", { credentials: "include" });

    console.log("➡️ Status HTTP:", res.status);
    console.log("➡️ Headers:", [...res.headers.entries()]);

    if (!res.ok) return null;

    const text = await res.text();
    const jsonStart = text.indexOf('{');
    const jsonData = JSON.parse(text.slice(jsonStart));

    // 🔥 LOG DU JSON PARSÉ
    console.log("✅ JSON PARSÉ:", jsonData);

    const missions = jsonData.missions ?? [];
    const attackFleet = [];
    const attaquants = new Set();
    const arrivalTime = new Set();
    const targetCoords = new Set();

    for (const mission of missions) {
      if (mission.mission_type === "attaquer") {
        attaquants.add(mission.owner_pseudo);
        const date = new Date(mission.arrival_time * 1000);
        arrivalTime.add(date.toLocaleTimeString('fr-FR'));

        const targetCoords_str = [
          mission.galaxy_target,
          mission.system_target,
          mission.planet_target
        ].join('-');
        
        targetCoords.add(targetCoords_str);

        const fleet = JSON.parse(mission.fleet);

        for (const vaisseau of fleet) {
          const existing = attackFleet.find(v => v.id === vaisseau.id);
          if (existing) existing.nombre += vaisseau.nombre;
          else attackFleet.push({ id: vaisseau.id, nombre: vaisseau.nombre });
        }
      }
    }

    return {
      attack: attackFleet.length > 0,
      attackFleet,
      attaquants: [...attaquants],
      arrivalTime: [...arrivalTime],
      targetCoords: [...targetCoords],
      expe: jsonData.Expe
    };


  } catch (err) {
    console.error("Erreur getFleets", err);
    return null;
  }
}

// --- Check régulier avec setInterval ---
setInterval(async () => {
  console.log("Get fleet");
  const fleets = await getFleets();
  if (!fleets) return;

  // Récupération des paramètres stockés
  const { discord_id, server_url, audioEnable, exploreEnable, attackEnable } =
    await chrome.storage.local.get([
      "discord_id",
      "server_url",
      "audioEnable",
      "exploreEnable",
      "attackEnable"
    ]);

  if (!discord_id || !server_url) return;

  const token = await getToken();

  // --- Check attaques ---
  if (attackEnable && fleets.attack && isReadyAttack) {
    isReadyAttack = false;

    fetch(`${server_url}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ 
        message: "⚠️ Une attaque est en cours.",
        discord_id, 
        fleet: fleets.attackFleet, 
        attaquants: fleets.attaquants, 
        arrivalTime: fleets.arrivalTime, 
        targetCoords: fleets.targetCoords 
      })
    }).catch(console.error);

    if (audioEnable) playOffscreenSound();
  }

  // --- Check expé ---
  if (exploreEnable && fleets.expe > 0 && isReadyExpe) {
    isReadyExpe = false;

    fetch(`${server_url}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ 
        message: "🚀 Nouvelle expédition en cours.",
        discord_id
      })
    }).catch(console.error);
  }

  // --- Réarmement ---
  if (!fleets.attack) isReadyAttack = true;
  if (fleets.expe === 0) isReadyExpe = true;

}, CHECK_INTERVAL);


// --- OFFSCREEN AUDIO ---
async function ensureOffscreen() {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["AUDIO_PLAYBACK"], justification: "Play alert sound" });
  }
  offscreenReady = true;
}

async function playOffscreenSound() {
  const now = Date.now();
  if (now - lastSoundTime < SOUND_COOLDOWN) return;
  lastSoundTime = now;

  await ensureOffscreen();
  chrome.runtime.sendMessage({ action: "offscreen-play-sound" });
}

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action === "sendToServer") {
    const { data } = msg;
    try {
      const { server_url } = await chrome.storage.local.get("server_url");
      const token = await getToken(); // déjà présent dans ton background

      await fetch(`${server_url}/update_galaxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ players: data })
      });

      console.log("✅ Données galaxie envoyées au serveur");
    } catch (e) {
      console.error("❌ Erreur envoi galaxie au serveur", e);
    }
  }
});