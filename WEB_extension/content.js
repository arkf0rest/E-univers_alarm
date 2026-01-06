var carto = carto || [];
var stopScan = stopScan || false;


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getPageData(galaxy, system) {
  const url = `https://e-univers.fr/FONCTIONS/AUTRES/galaxie_data.php?galaxy=${galaxy}&system=${system}&serveur_id=3`;

  const res = await fetch(url, { credentials: "include" });
  const text = await res.text();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  const data = JSON.parse(text.slice(jsonStart, jsonEnd + 1));

  if (!data.success) return;

  for (const p of data.planets) {
    const badges = [];
    if (p.noob_protected) badges.push("D");
    if (p.vacation) badges.push("MV");
    if (p.inactive) badges.push("i");
    if (p.inactive21) badges.push("I");

    carto.push({
      owner: p.pseudo,
      badges,
      galaxy: p.galaxie,
      system: p.systeme,
      planet: p.planete
    });
  }
}

async function scanUniverse() {
  console.log("🚀 Scan univers démarré");

  const TOTAL_GALAXIES = 3;
  const SYSTEMS_PER_GALAXY = 200;
  let scannedSystems = 0;

  for (let galaxy = 1; galaxy <= TOTAL_GALAXIES; galaxy++) {
    if (stopScan) break;
    for (let system = 1; system <= SYSTEMS_PER_GALAXY; system++) {
      if (stopScan) break;

      await getPageData(galaxy, system);
      scannedSystems++;

      const percent = Math.floor((scannedSystems / (TOTAL_GALAXIES * SYSTEMS_PER_GALAXY)) * 100);

      chrome.runtime.sendMessage({
        action: "updateProgress",
        percent,
        galaxy,
        system
      });

      // sauvegarde pour restaurer popup
      chrome.storage.local.set({ lastPercent: percent, lastGalaxy: galaxy, lastSystem: system });
      await sleep(100);
    }
  }

  console.log("✅ Scan terminé");

  const grouped = groupByPlayer(carto);
  chrome.runtime.sendMessage({ action: "sendToServer", data: grouped });

  // notification finale
  chrome.runtime.sendMessage({ action: "scanFinished" });
  chrome.storage.local.set({ scanFinished: true, lastPercent: 100 });
}


function groupByPlayer(carto) {
  const players = {};
  carto.forEach(p => {
    if (!players[p.owner]) {
      players[p.owner] = {
        badges: p.badges,
        planets: new Set()
      };
    }
    players[p.owner].planets.add(`${p.galaxy}-${p.system}-${p.planet}`);
  });

  // Convertir Sets en array avant d'envoyer
  for (const key in players) {
    players[key].planets = Array.from(players[key].planets);
  }

  return players;
}


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startScan") {
    stopScan = false;  // pour être sûr que le scan peut démarrer
    carto = [];        // reset les données
    scanUniverse();    // lancer le scan
  }
});