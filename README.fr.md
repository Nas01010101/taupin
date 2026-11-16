[English](README.md) · Français

<p align="center"><img src="docs/assets/logo.svg" width="120" alt="Logo de Taupin : un plant d'orge et une feuille avec un taupin"></p>

# Taupin

Taupin classe les rotations de cultures sur cinq ans pour un champ selon le sol, l'eau et les
ravageurs, à partir des données de la NASA. Choisissez un champ n'importe où sur une carte : la page
le construit en 3D et note sept rotations avec la pluie GPM IMERG, la température du sol NASA POWER,
l'humidité du sol SMAP et le couvert végétal HLS. Les photos et les notes du producteur s'ajoutent
comme donnée, épinglées sur le champ. Le producteur et l'agronome décident.

Conçu pour NASA Space Apps 2026 (Field Shift: Adapting Farms with NASA Data). Le Québec sert de champ
d'exemple. Taupin est le nom français du coléoptère taupin et de sa larve, le ver fil-de-fer.

Application : https://nas01010101.github.io/taupin/ (anglais ; français avec `?lang=fr`).
Vidéo de démonstration, 30 s : https://youtu.be/k4BG-ckcc1k, aussi dans [`docs/assets/demo-30s.mp4`](docs/assets/demo-30s.mp4).

![Taupin : le champ en 3D à côté des rotations classées](docs/assets/hero.png)

## Fonctions

- **Votre champ en 3D.** Un toucher sur la carte construit un carré de 600 m dans le navigateur, en
  environ 6 s : lidar HRDEM de RNCan à 1 m au Canada, AWS Terrain Tiles ailleurs, avec les couches de
  couvert végétal, de température de surface, d'indice d'humidité et de matière organique SoilGrids.
  Le champ reste sur l'appareil et se rouvre avec `?field=mine`.
- **Est-ce un champ en culture ?** La moitié ou plus du carré sous un couvert de 3 m ou plus veut
  dire non.
- **Rotations classées.** Sept rotations sur cinq ans, notées sur le déficit en eau en année sèche,
  la perte de sol (couverture USLE), l'azote à acheter, les résidus retournés et les ravageurs du sol.
  Le producteur coche ce qui compte et choisit sa rotation actuelle ; les cartes se reclassent et
  chacune donne sa raison.
- **Photos et notes.** Une photo ou une note (insecte du sol, eau stagnante, couvert, rigole) est
  épinglée sur le champ en 3D et change le classement. Un modèle de photo à 8 classes (DINOv2-S, ONNX
  int8) tourne dans le navigateur et répond « incertain » sous son seuil. Rien ne quitte l'appareil.

La vidéo, scène par scène, avec le code de chaque partie : [`docs/SYSTEM.md`](docs/SYSTEM.md).
Lien avec le défi : [`docs/CHALLENGE_FIT.md`](docs/CHALLENGE_FIT.md). Limites mesurées et travail
à venir : [`docs/PROJECT.md`](docs/PROJECT.md).

## Lancer l'application

Dans le navigateur : https://nas01010101.github.io/taupin/ (déployée à partir de `web/` et `model/`
par `.github/workflows/pages.yml` à chaque envoi sur `main`).

En local, avec Python 3.9 ou plus récent (bibliothèque standard seulement) et un navigateur :

| Système | Commande |
|---|---|
| macOS | double-cliquer `run.command`, ou `./run.command` |
| Windows | double-cliquer `run.bat` |
| Linux | `./run.sh` |
| Tous, avec uv | `uv run python -m taupin` |

Le serveur écoute sur 127.0.0.1 à partir du port 8780 (premier port libre) et ouvre le navigateur.
`?field=demo` ouvre le carré du parc de la vidéo, `?field=laval`, `eustache` ou `mirabel` un champ
agricole du Québec, `?demo=1` la démonstration de photo. L'application fonctionne hors ligne une fois
chargée.

Classer des photos en ligne de commande (Python 3.11 ou plus récent) :

```bash
uv run --extra classify taupin classify photo1.jpg photo2.jpg
```

Tests : `node --test web/test/*.test.mjs` et `PYTHONPATH=src uv run --group dev python -m pytest`.

## Organisation

- `web/` : l'application, statique, sans étape de compilation. `three`, `onnxruntime-web` et `leaflet` sont
  inclus dans `web/vendor/` (versions dans `web/vendor/VERSIONS.md`).
- `src/taupin/` : moteur de rotations et de ravageurs, récupération NASA POWER, GPM IMERG et SMAP,
  couches du champ, préparation, serveur local, classeur en ligne de commande.
- `risk/` : le modèle de risque du champ (82 champs du Québec, variables NASA POWER, ajustement et
  métriques).
- `train/`, `model/`, `data/` : entraînement du modèle de photo, le modèle exporté et l'attribution
  des images.
- `scripts/capture.mjs` : captures d'écran et images de démonstration avec Chrome sans interface.

## Modèle de photo

D'après `model/metrics.json` (`v2-dinov2s`, DINOv2-S affiné, 8 classes, 23 Mo en ONNX int8). Sous une
probabilité de 0,892 pour la première classe, l'application répond « incertain : envoyer au
laboratoire ».

| Ensemble | Photos | Exactitude | F1 macro | Répondu | Exactitude quand répondu |
|---|---|---|---|---|---|
| Validation | 976 | 94,6 % | 0,946 | 90,0 % | 98,1 % |
| Test (scellé) | 756 | 92,5 % | 0,931 | 84,9 % | 97,5 % |
| Autres sources (GBIF 334, Wikimedia Commons 157) | 491 | 92,7 % | 0,926 | 85,3 % | 97,4 % |

Le nombre d'images par classe, la table des seuils et la méthode de séparation sont dans
`model/MODEL_CARD.md`.

## Données et licences

| Données | Usage | Licence |
|---|---|---|
| Pluie quotidienne NASA GPM IMERG par NASA POWER, avec `T2M_MAX`, `T2M_MIN`, 2001 à 2025 | besoin en eau des rotations, jours de forte pluie sur sol nu | données ouvertes NASA |
| NASA POWER (MERRA-2) `TSOIL1`, `GWETROOT` | température du sol ; variables du risque du champ | données ouvertes NASA |
| Humidité du sol de la zone racinaire NASA SMAP L4 par GIBS, 2015 à 2025 | vérification de la variable d'humidité POWER | données ouvertes NASA |
| NASA HLS v2.0 (Landsat 8/9 et ESA Sentinel-2), 2020 à 2025 | couche de couvert végétal (NDVI) | données ouvertes NASA |
| USGS Landsat 8/9 Collection 2 niveau 2, 2016 à 2025 | couche de température de surface au printemps | domaine public |
| Lidar HRDEM de RNCan, 1 m | relief, hauteur du couvert, pente, indice d'humidité | Licence du gouvernement ouvert - Canada |
| AWS Terrain Tiles | terrain là où il n'y a pas de lidar | sources ouvertes mixtes (attribution tilezen/joerd) |
| ISRIC SoilGrids 2.0, 250 m | matière organique pour tout champ | CC BY 4.0 |
| Inventaire annuel des cultures d'AAC | historique des cultures au Canada | Licence du gouvernement ouvert - Canada |
| Carte des sols de l'IRDA et tables CanSIS d'AAC | unités de sol des champs du Québec | voir `DATA_SOURCES.md` |
| OpenStreetMap | fond de carte, contour du parc | ODbL |
| Labrie et al. 2020, PLoS ONE 15(2): e0229136 | dénombrements du modèle de risque | CC BY 4.0 |
| Photos iNaturalist, GBIF et Wikimedia Commons | entraînement et test du modèle de photo | CC0, CC-BY ou domaine public, par image dans `data/attribution.csv` |
| FAO-56 ; fiche MAAARO 23-005 ; grilles d'azote du CRAAQ et du MAPAQ ; Lal 2005 ; RAP Grandes cultures | besoin en eau, couverture USLE, azote, résidus, règles sur les ravageurs | cité |

`DATA_SOURCES.md` donne chaque couche avec sa source, sa licence, sa résolution et sa date d'accès.
Les poids du modèle partent de `timm/vit_small_patch14_dinov2.lvd142m` (Meta DINOv2, Apache-2.0).
Code : MIT (`LICENSE`).

Photos de la galerie (Wikimedia Commons) :

| Photo | Auteur | Licence |
|---|---|---|
| [Ver fil-de-fer (larve d'Elateridae)](https://commons.wikimedia.org/wiki/File:Click_beetle_larvae.jpg) | ZATRIPPIT | CC0 |
| [Taupin (Agriotes adulte)](https://commons.wikimedia.org/wiki/File:Wireworm_Click_Beetle_-_Agriotes_obscurus_%3F_(51859491891).jpg) | gailhampshire | CC BY 2.0 |
| [Chrysomèle des racines du maïs, adulte](https://commons.wikimedia.org/wiki/File:Western_corn_rootworm.jpg) | inconnu | domaine public |
| [Larves de chrysomèle des racines du maïs](https://commons.wikimedia.org/wiki/File:Diabrotica_virgifera_virgifera_larvae.jpg) | Scott Bauer, USDA ARS | CC BY 3.0 |
| [Carabe (Carabidae)](https://commons.wikimedia.org/wiki/File:Pterostichus_melanarius_321269585.jpg) | Alexandria 'Alex' Wenninger | CC BY 4.0 |
| [Ver blanc (larve de scarabée)](https://commons.wikimedia.org/wiki/File:Popillia_japonica_(28).jpg) | Michael Reding, USDA ARS, Bugwood.org | CC BY 3.0 US |

## Limites

- Le champ de démonstration est un carré de 600 m dans le Parc-nature du Bois-de-Liesse (45,5013 N,
  73,7651 O), un parc de Montréal qui sert de substitut. L'application indique elle-même que ce n'est
  pas un champ en culture : 68 % de 36 ha sont sous les arbres, 1,3 ha est à découvert.
- Le modèle de risque du champ compte 82 champs ; son AUC de 0,80 par champ exclu (IC à 95 % de 0,63
  à 0,93) est optimiste, et une année exclue donne 0,68. Il classe les champs ; il ne donne pas de
  probabilité.
- Une photo est un premier tri, pas un dénombrement. Une photo sans animal du sol peut tout de même
  recevoir un nom avec confiance (`model/MODEL_CARD.md`). Aucun ensemble de test de photos prises dans
  des champs du Québec n'existe encore.
- NASA POWER est une grille d'environ 50 km ; un champ peut s'écarter des valeurs affichées.
- Le lidar, la carte des cultures d'AAC et la carte des sols de l'IRDA couvrent seulement le Canada ;
  ailleurs, le champ utilise des tuiles de terrain et SoilGrids, et le producteur entre l'historique
  des cultures.
- Aucun producteur ni agronome n'a encore essayé l'outil. Ce n'est pas un produit de la NASA ; il
  utilise des données ouvertes de la NASA.

Photos de la sortie sur le terrain de l'équipe : [udem-ai-in-nature](udem-ai-in-nature/).

Le code, les tests et la documentation ont été écrits avec des assistants de programmation par IA et
révisés par l'équipe.
