# -*- coding: utf-8 -*-
"""Prépare la bibliothèque d'images des manuels.

    python3 manuels/outils/preparer-images.py

À rejouer seulement quand la bibliothèque source change, ou pour ajouter un
visuel : les .jpg produits sont versionnés dans assets/img/.

Les sources font 8215 x 5482 px (45 Mpx, 20 a 30 Mo piece) : inutilisables telles
quelles dans un document. On redescend a 1400 px de large, ce qui couvre une pleine
page A4 a 150 dpi (1240 px) sans gaspillage, en JPEG q78.

Le nom de sortie dit CE QUE MONTRE la photo, pas son numero d'appareil : « levure.jpg »
se retrouve, « 7.jpg » non.
"""
import os
from PIL import Image

BASE = "/Users/maximedespaux/Desktop/PHOTOS/École Pizza - BASE"
DST = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/assets"
LARGE = 1400

PHOTOS = {
    # — Couvertures —
    "couv-niveau1":      "IMAGE NIVEAU 1/109.jpg",
    "couv-rs":           "IMAGE NIVEAU 1/85.jpg",
    "couv-hygiene":      "HACCP/49.jpg",
    "couv-pro":          "IMAGE NIVEAU 1 PRO/NIVEAUIPRO.jpg",
    "couv-niveau2":      "IMAGE NIVEAU 2/L1080717.jpg",
    "couv-expert":       "IMAGE NIVEAU 2/L1090058 (1).png",
    "couv-teglia":       "PARTENAIRES PHOTOS/L1090793.jpg",
    "couv-napolitaine":  "IMAGE NAPO/L1180613.jpg",
    "couv-livret":       "PHOTO ECOLE/L1090229.png",
    # — Matieres premieres —
    "farine-bassine":    "MATIERES PREMIERES/20.jpg",
    "farine-cuve":       "MATIERES PREMIERES/56.jpg",
    "farine-cuve2":      "MATIERES PREMIERES/57.jpg",
    "levure":            "MATIERES PREMIERES/7.jpg",
    "eau":               "MATIERES PREMIERES/22.jpg",
    "sel":               "MATIERES PREMIERES/48.jpg",
    "sel-gros":          "MATIERES PREMIERES/L1090331.jpg",
    "huile":             "MATIERES PREMIERES/46.jpg",
    "huile-verre":       "MATIERES PREMIERES/L1090165.jpg",
    "tomate":            "MATIERES PREMIERES/R-1-1.jpg",
    "mozzarella":        "MATIERES PREMIERES/L1090367.jpg",
    "mozzarella-main":   "MATIERES PREMIERES/10.jpg",
    "mozzarella-bufala": "MATIERES PREMIERES/L1180648.jpg",
    "trancheur":         "MATIERES PREMIERES/53.jpg",
    # — Gestes —
    "rabat":             "IMAGE NIVEAU 2/L1090388.jpg",
    "boulage":           "IMAGE NIVEAU 1/78.jpg",
    "fleurage":          "IMAGE NIVEAU 1/79.jpg",
    "etalage":           "IMAGE NIVEAU 1/80.jpg",
    "etalage-formateur": "IMAGE NIVEAU 1/91.jpg",
    "patons-bac":        "IMAGE NIVEAU 1/L1080725.png",
    "patons":            "IMAGE NIVEAU 1/L1080736.jpg",
    "maturation":        "IMAGE NIVEAU 1/L1090128 (1).png",
    # — Indirects —
    "gluten-reseau":     "IMAGE NIVEAU 2/L1080717.jpg",
    "poolish-verre":     "IMAGE NIVEAU 2/1.jpg",
    "poolish-bol":       "IMAGE NIVEAU 2/L1080778.jpg",
    "biga-main":         "IMAGE NIVEAU 2/L1090058 (1).png",
    "biga-melange":      "IMAGE NIVEAU 2/L1090035.jpg",
    "biga-texture":      "IMAGE NIVEAU 2/L1090100.jpg",
    # — Fours & materiel —
    "four-bois":         "PARTENAIRES PHOTOS/L1080743.jpg",
    "four-marana":       "PARTENAIRES PHOTOS/L1080738.jpg",
    "four-flamme":       "PARTENAIRES PHOTOS/89.jpg",
    "four-electrique":   "PARTENAIRES PHOTOS/L1090793.jpg",
    "enfournement":      "PARTENAIRES PHOTOS/L1180441.jpg",
    "petrins":           "PHOTO ECOLE/L1090304.jpg",
    "petrin-spirale":    "PHOTO ECOLE/L1090311.jpg",
    "bacs-gilac":        "PARTENAIRES PHOTOS/5.jpg",
    "petit-materiel":    "PHOTO ECOLE/L1090201.jpg",
    "salle-cuisson":     "PHOTO ECOLE/81.jpg",
    # — L'ecole —
    "salle-theorique":   "PHOTO ECOLE/6.jpg",
    "equipe-petrins":    "PHOTO ECOLE/L1090229.png",
    "couloir":           "PHOTO ECOLE/2.jpg",
    "groupe":            "PHOTO ECOLE/58.jpg",
    "veste":             "PHOTO ECOLE/17.jpg",
    "formateur":         "PHOTO ECOLE/14.jpg",
    "accueil":           "PHOTO ECOLE/4.jpg",
    # — Hygiene —
    "hygiene-cours":     "HACCP/49.jpg",
    "hygiene-salle":     "HACCP/50.jpg",
    "hygiene-notes":     "HACCP/51.jpg",
    "hygiene-tableau":   "HACCP/47.jpg",
    # — Napolitaine —
    "napo-etalage":      "IMAGE NAPO/L1180407.jpg",
    "napo-garniture":    "IMAGE NAPO/51.jpg",
    "napo-crue":         "IMAGE NAPO/52.jpg",
    "napo-huile":        "IMAGE NAPO/53.jpg",
    "napo-four":         "IMAGE NAPO/L1180613.jpg",
    "napo-poste":        "IMAGE NAPO/103.jpg",
    "napo-pelle":        "IMAGE NAPO/36.jpg",
}


# Les logos gardent leur transparence : ils se posent sur des fonds de couleur.
LOGOS = {
    "logo":       "LOGO/PETIT2.png",
    "logo-blanc": "LOGO/BLANC ET ROUGE.png",
    "qualiopi":   "LOGO/Logo-Qualiopi-PNG.webp",
    "icpf":       "LOGO/ICPF & Cofrac.png",
    "apf":        "LOGO/APF.png",
}

os.makedirs(DST + "/img", exist_ok=True)
os.makedirs(DST + "/logo", exist_ok=True)
poids = 0
for nom, src in sorted(PHOTOS.items()):
    chemin = os.path.join(BASE, src)
    if not os.path.exists(chemin):
        print("  MANQUANT  %s -> %s" % (nom, src)); continue
    im = Image.open(chemin).convert("RGB")
    if im.width > LARGE:
        im = im.resize((LARGE, round(im.height * LARGE / im.width)), Image.LANCZOS)
    cible = "%s/img/%s.jpg" % (DST, nom)
    im.save(cible, quality=78, optimize=True, progressive=True)
    poids += os.path.getsize(cible)

for nom, src in sorted(LOGOS.items()):
    chemin = os.path.join(BASE, src)
    if not os.path.exists(chemin):
        print("  MANQUANT  %s -> %s" % (nom, src)); continue
    im = Image.open(chemin).convert("RGBA")
    if im.width > 700:
        im = im.resize((700, round(im.height * 700 / im.width)), Image.LANCZOS)
    cible = "%s/logo/%s.png" % (DST, nom)
    im.save(cible, optimize=True)
    poids += os.path.getsize(cible)

print("%d photos + %d logos — %.1f Mo au total" % (len(PHOTOS), len(LOGOS), poids / 1e6))
