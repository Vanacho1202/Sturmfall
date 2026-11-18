# Sturmfall

Battle Royale im Browser (Fortnite-Stil) mit 100 Spielern (Menschen + Bots), Solo und Duo.

- **Spielen:** https://sturmfall.onrender.com (PC, Handy, iPad)
- **Android-App:** https://sturmfall.onrender.com/app (APK, lädt das Spiel live – jedes Update ist sofort drin)
- **Code:** GitHub `Vanacho1202/Sturmfall`, Hosting auf Render (kostenlos, schläft nach Inaktivität – erster Start dauert bis ~1 Min.)
- **Auto-Update:** Push auf `main` → Render baut und startet neu. Die App braucht dafür keine neue APK.

## Aufbau

| Datei | Inhalt |
|---|---|
| `server.js` | Node-Server (HTTP + WebSocket), Bots, Sturm, Loot, Bauen, Duo/Reboot |
| `public/shared.js` | Karte (18 Orte, Berge, Seen, Straßen), Waffen, Gegenstände, Sturmphasen |
| `public/game.js` | Spiel im Browser (Three.js): Steuerung, Bewegung, Kampf, HUD |
| `public/models.js` | Eigene 3D-Modelle (Figuren, Waffen, Autos, Häuser, Natur) |
| `public/gfx.js` | Grafik: Gelände, Wasser, Nachbearbeitung, Partikel, Qualitätsstufen |
| `public/sfx.js` | Klangsystem (3D-Sound, erzeugte Effekte + echte Waffenaufnahmen in `public/snd/`) |
| `public/settings.js` | Einstellungsmenü |
| `android/` | Android-App (WebView-Hülle) |

## Inhalt

- Karte 10× größer, 18 Orte, Bus, Sturm mit 8 Phasen und Vorschau, Versorgungsabwürfe
- Waffen: Sturmgewehr, MP, Pistole, Schrotflinte, Taktische Schrotflinte, Scharfschützengewehr, Jagdgewehr, Raketenwerfer – Seltenheit bis Mythisch
- Gegenstände: Verband, Medikit, Mini-Schild, Schildtrank, Schildfass, Granate, Stinkbombe, Tarnbusch
- Bauen: Wand, Boden, Rampe, Dach, Wände bearbeiten (Fenster/Tür), Holz/Stein/Metall bis 1000
- Bewegung: Auto-Sprint, Rutschen, Klettern, Schwimmen, Gleiter neu öffnen, Autos
- Duo: Niederschlagen, Wiederbeleben, Reboot-Karten und Funkmasten
- Einstellungen: Auto-Feuer, Empfindlichkeit, FOV, Tasten, Lautstärke, Touch-Knöpfe verschieben

## Steuerung (PC, änderbar unter ⚙ / P)

WASD laufen · Leertaste springen/Gleiter · Strg ducken/rutschen · Shift gehen · R nachladen · E benutzen ·
Q/F/C/V Wand/Boden/Rampe/Dach · G bearbeiten · M Karte · T markieren · B tanzen · Tab Spielerliste · P Einstellungen

## Lokal testen

```
npm install
node server.js            # http://localhost:3000
LOBBY=2 SPEED=5 GOD=1 node server.js   # Test: schnelle Runde, Menschen unverwundbar
```

## APK neu bauen (Windows)

```
cd android
set JAVA_HOME=C:\Users\Vanac\.jdks\ms-21.0.12
gradlew.bat assembleRelease
```
APK nach `public/Sturmfall.apk` kopieren und pushen.

## Waffengeräusche

Aus Gabriels Aufnahmen geschnitten (Downloads, 18.11.2026): SCAR → Sturmgewehr, MP5 → MP, Glock 17 → Pistole,
Shotgun → Schrotflinten (+ Pumpen), Barrett .50 → Scharfschütze/Jagdgewehr (+ Nachladen).

## Fremde Inhalte (CC0, frei nutzbar)

- 3D-Modelle: Kenney (kenney.nl) – City Kits, Car Kit, Furniture, Nature, Pirate, Survival
- Explosionen: „150 Combat Sound Effects“ (untamedpixels) und „Muffled Distant Explosion“ (NenadSimic), opengameart.org
