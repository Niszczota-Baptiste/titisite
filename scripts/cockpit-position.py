#!/usr/bin/env python3
"""Boussole 🧭 — relais F3+C → site.

En jeu, maintiens F3 + C : Minecraft copie ta position dans le presse-papiers
(« /execute in minecraft:overworld run tp @s 812.50 62.00 -1044.30 45.0 12.0 »).
Ce script surveille le presse-papiers (1 lecture/s) et, dès qu'une nouvelle
ligne F3+C apparaît, l'envoie au site via ton jeton cockpit. La boussole du
site (bouton 🧭 sur les coffres et dans les fiches de quêtes) la lit ensuite
en direct.

Usage :
    python cockpit-position.py https://baptiste-niszczota.com <jeton-cockpit>

Le jeton est celui de l'onglet « 🛰️ Cockpit » du dashboard /admin (la fin de
l'URL du flux, sans le « .json »). 100 % bibliothèque standard (tkinter +
urllib) — rien à installer. À intégrer tel quel dans ton app cockpit si tu
préfères (la boucle `watch` est autonome).
"""

import json
import re
import sys
import time
import urllib.request

F3C = re.compile(r"execute\s+in\s+\S+\s+run\s+tp\s+@s\s+-?\d")


def send(base, token, raw):
    req = urllib.request.Request(
        f"{base}/api/quests/cockpit/{token}/position",
        data=json.dumps({"raw": raw}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


def watch(base, token):
    import tkinter  # importé ici : inclus avec Python sur Windows/macOS

    tk = tkinter.Tk()
    tk.withdraw()  # pas de fenêtre : on ne veut que l'accès presse-papiers
    last = None
    print("🧭 En attente… fais F3+C en jeu (Ctrl-C pour quitter).")
    while True:
        try:
            clip = tk.clipboard_get()
        except tkinter.TclError:  # presse-papiers vide ou non textuel
            clip = None
        if clip and clip != last and F3C.search(clip):
            last = clip
            try:
                pos = send(base, token, clip)
                print(f"→ envoyé : {pos['world']} {pos['x']:.0f} {pos['y']:.0f} {pos['z']:.0f}")
            except Exception as e:  # noqa: BLE001 — réseau coupé, jeton régénéré…
                print(f"⚠️ envoi raté ({e}) — nouvelle tentative au prochain F3+C")
                last = None
        time.sleep(1)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    watch(sys.argv[1].rstrip("/"), sys.argv[2])
