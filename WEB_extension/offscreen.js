console.log("offscreen.js chargé et prêt");

const audio = new Audio(chrome.runtime.getURL("sound/sound.mp3"));

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "offscreen-play-sound") {
    console.log("Message reçu : lecture du son");
    audio.currentTime = 0;
    audio.play()
      .then(() => console.log("🔊 Son joué"))
      .catch(e => console.error("Erreur audio :", e));
  }
});
