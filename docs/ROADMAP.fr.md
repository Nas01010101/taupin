[English](ROADMAP.md) · Français

# Feuille de route de Taupin : de trois champs québécois à n'importe quel champ

État au 2026-11-15. Ce fichier énumère ce que Taupin doit devenir, ce qui existe aujourd'hui, l'écart
entre les deux et le travail à faire, dans l'ordre. Il accompagne `docs/PROJECT.md` (état actuel et
lacunes de la version du hackathon).

## 1. Ce que Taupin doit devenir

Un assistant pour les producteurs agricoles. Il modélise leur champ à partir de données satellitaires et publiques, prédit les
propriétés qui comptent pour un plan de cultures, et tient une base de données où ils comparent des rotations. Le
producteur choisit la rotation ; Taupin montre les chiffres, leur plage et leur source.

- **Leur champ, modélisé.** Une vue 3D du champ construite à partir du lidar ou d'un modèle d'élévation mondial,
  avec la vigueur des cultures, la température du sol, les zones humides et l'historique de cultures à partir des missions de la NASA, de l'ESA et de l'ASC.
- **Des prédictions pour chaque propriété du champ.** Matière organique, texture, eau disponible,
  drainage, humidité du sol durant la saison, érosion, besoin en azote, pression des ravageurs et vigueur
  attendue des cultures, chacune avec une plage et sa source. Affichées seulement là où des tests sur données mises de côté les appuient.
- **Une base de données de rotations.** Toute rotation saisie par le producteur, évaluée année par année sur son champ,
  et comparée à ce que des champs semblables ont réellement cultivé et à leurs résultats.
- **Le savoir du producteur d'abord.** L'historique de cultures, les analyses de sol, les dénombrements de pièges, les rendements et les photos
  saisis par le producteur l'emportent sur les données publiques et mettent à jour chaque prédiction.

La portée s'élargit en trois étapes : le Québec d'abord (là où se trouvent les règles sur les ravageurs et les cartes des sols), puis le Canada
et les États-Unis, puis tout pays où les données mondiales tiennent la route.

## 2. Ce qui existe aujourd'hui

| Composante | Où | Limite |
|---|---|---|
| Champ en 3D, 300 x 300 cellules de 2 m, relief lidar, vigueur HLS, chaleur du sol Landsat, indice d'humidité topographique, unités de sol, matière organique, historique de cultures | `src/taupin/layers.py`, `src/taupin/fetch_layers.py`, `web/js/scene.js`, `web/js/layers.js` | préparé hors ligne pour trois champs agricoles du Québec et un parc de démonstration seulement |
| Données saisies par le producteur : emplacement, historique de cultures par année, priorités, travail du sol, rotation personnelle, dénombrements de pièges, photos | `web/js/history.js`, `web/js/swui.js`, `web/js/scout.js`, `web/js/finds.js` | stockées sur l'appareil seulement ; non utilisées pour améliorer un modèle |
| Évaluation des rotations : eau en année sèche (pluie GPM comparée à FAO-56), forte pluie sur sol nu, facteur de couverture de l'USLE, azote à acheter, résidus, niveaux de ver fil-de-fer et de chrysomèle | `web/js/soilwater.js`, `web/data/crops.json`, `web/data/rotations.json` | fondée sur des règles ; sept rotations fixes ; aucun effet de la culture précédente sur le rendement ; aucune culture de couverture ; la perte de sol est relative, pas en t/ha |
| Moteur de règles sur les ravageurs (seuils du RAP du Québec) | `src/taupin/engine.py`, `web/js/engine.js` | règles du Québec seulement |
| Modèle de risque du champ, AUC 0,80 sur 82 champs du Québec dénombrés au piège-appât | `risk/`, `src/taupin/fieldrisk.py`, `web/js/fieldrisk.js` | rang du champ entier, pas une probabilité ; une seule région d'étude |
| Date de piégeage et rang du champ pour toutes coordonnées à partir de NASA POWER | `web/js/power.js` | la vue 3D et le tableau de ravageurs restent sur un champ préparé d'avance |
| Matière organique : relevé pédologique par champ, SoilGrids pour tout point | `src/taupin/organic.py`, `web/js/organic.js` | aucun modèle ; valeurs affichées telles quelles |
| Classificateur de photos d'insectes, DINOv2-S, 8 classes, dans le navigateur | `model/`, `web/js/classify.js` | aucune photo de champ du Québec dans le jeu de test |
| Application Web hors ligne, français et anglais | `web/`, `web/js/i18n*.js` | sans objet ici |

Mesuré le 2026-11-15 : les caractéristiques du terrain issues du lidar ne prédisent pas le NDVI HLS sur les terres cultivées à découvert pour
les trois champs préparés d'avance (r de Pearson en validation croisée par champ exclu : Laval 0,36, Saint-Eustache -0,28,
Mirabel -0,09 ; régression ridge sur des cellules de 30 m, cellules avec couvert d'arbres exclues). La prédiction
par champ exige des données d'entraînement provenant de nombreux champs, pas de trois.

## 3. Écart entre les deux

| Capacité | Aujourd'hui | Nécessaire | Élément bloquant |
|---|---|---|---|
| Modèle 3D de n'importe quel champ | 3 champs préparés d'avance | construit sur demande pour tout champ tracé par le producteur | un service de préparation, ou un constructeur dans le navigateur qui utilise des couches publiques en tuiles |
| Limite du champ | carré fixe de 600 m | le contour du champ du producteur | outil de dessin sur carte ; détection des limites en option |
| Prédictions des propriétés | valeurs du relevé pédologique et de SoilGrids affichées telles quelles ; pas de plages pour la plupart des propriétés | prédictions par champ avec plages pour le sol, l'eau, l'érosion, l'azote, les ravageurs, la vigueur | modèles entraînés sur des milliers de champs, validation par groupes |
| Vigueur des cultures selon la rotation | non prédite | vigueur attendue par culture et par année selon la rotation | modèle de l'effet de la rotation (travail commencé dans `rotation_ml/`) |
| Base de données de rotations | 7 rotations fixes | toute rotation saisie par le producteur, plus ce que des champs semblables ont cultivé | éditeur de rotations ; indice de similarité entre champs sur les champs d'entraînement |
| Données du producteur qui améliorent le modèle | stockées localement, inutilisées | partage volontaire utilisé comme étiquettes | processus de consentement, envoi anonymisé, chaîne de réentraînement |
| Régions hors Québec | règles sur les ravageurs et cartes des sols du Québec | adaptateurs de données et règles par région | adaptateurs énumérés à la section 5 |
| Rendement | non traité | rendement là où les producteurs partagent des cartes de rendement ; vigueur ailleurs | importation de cartes de rendement (ISOXML, shapefile, CSV) |

## 4. Plan de travail

Chaque volet énumère les fichiers à écrire ou à modifier et le test à réussir avant sa mise en service.

### W1. Modèle de l'effet de la rotation (commencé)

Prédire la vigueur de la culture de l'année suivante à partir de la rotation, du sol, du terrain et de la météo.

- À écrire : `rotation_ml/sample.py` (points tirés de l'Inventaire annuel des cultures d'AAC, 2011 à 2025),
  `rotation_ml/ndvi.py` (NDVI maximal HLS par point et par année, Fmask), `rotation_ml/features.py`
  (SoilGrids, NASA POWER, GPM, SMAP, terrain, cultures précédentes), `rotation_ml/train.py`,
  `rotation_ml/README.md`.
- Cible : NDVI maximal moins la moyenne régionale pour cette culture et cette année.
- Validation : par groupes de régions et d'années.
- Critère : sur des régions mises de côté, le maïs après le soya obtient un score supérieur au maïs après le maïs. Sinon,
  le NDVI est une étiquette trop faible et W6 (cartes de rendement) passe en premier.
- Ensuite, modifier : `web/js/soilwater.js` et `web/js/swui.js` pour afficher la vigueur prédite avec sa plage
  à côté des colonnes fondées sur des règles ; `web/data/` reçoit le modèle exporté.

### W2. Modèles des propriétés

Un modèle par propriété, chacun avec un test sur données mises de côté et une plage.

| Propriété | Données d'entrée | Étiquettes | Critère |
|---|---|---|---|
| Matière organique, texture | composites HLS de sol nu, terrain lidar, SoilGrids | points de relevé CanSIS et IRDA ; SSURGO aux États-Unis | fait mieux que SoilGrids seul sur des points de relevé mis de côté |
| Eau disponible, classe de drainage | texture, terrain, indice d'humidité topographique | classes du relevé pédologique | exactitude par classe sur données mises de côté, rapportée classe par classe |
| Humidité du sol durant la saison | SMAP, pluie GPM, texture, bilan hydrique FAO-56 | SMAP et stations in situ (p. ex. AAC/RISMA au Canada) | erreur par rapport aux stations rapportée |
| Érosion, t/ha par an | USLE : R de la pluie GPM, K de la texture, LS du relief, C de la rotation | données publiées de parcelles lorsqu'elles existent | rapportée comme estimation avec plage ; aucun critère au-delà de vérifications de plausibilité |
| Besoin en azote | culture, culture précédente, matière organique | grilles de doses provinciales et d'États | correspond aux grilles dont il est tiré |
| Pression des ravageurs | modèle de risque du champ, historique de cultures, sol | études au piège-appât par région | AUC sur des champs mis de côté |

- À écrire : `src/taupin/props/` (un module par propriété, chacun sous 500 lignes), `tests/test_props_*.py`.
- À modifier : `web/js/layers.js` pour ajouter des couches prédites avec une légende de plage ; `web/js/organic.js` pour
  afficher le modèle et le relevé pédologique côte à côte.

### W3. 3D pour n'importe quel champ

- À écrire : `src/taupin/build_field.py`, qui prend le contour d'un champ et renvoie les mêmes fichiers
  `field.json` et de couches que l'application lit aujourd'hui (`web/data/fields/<id>/`).
- Option A, serveur : un petit service exécute la préparation sur demande et conserve le résultat en cache.
- Option B, navigateur : des couches publiques en tuiles (Copernicus DEM, composites HLS, SoilGrids) lues
  directement, résolution plus basse, sans serveur.
- Commencer par A pour le Québec, où le lidar HRDEM existe ; utiliser B là où il n'y a pas de lidar.
- À modifier : `web/js/fields.js` (charger un champ construit), `web/js/app.js` (tracer un champ, demander une construction),
  `web/index.html` (étape de tracé du champ).
- Critère : un champ construit sur demande correspond cellule par cellule au champ préparé d'avance de Laval.

### W4. Base de données de rotations et comparaison

- À écrire : `web/js/rotations.js` (éditeur de rotations : toutes cultures, toute durée, cultures de couverture), un indice de
  similarité entre champs (`rotation_ml/similar.py`) qui trouve les champs d'entraînement de sol,
  de climat et d'historique proches, et montre ce qu'ils ont cultivé et comment leur vigueur a évolué.
- À modifier : `web/data/rotations.json` devient une liste de départ, pas l'ensemble complet ; `web/js/swui.js`
  compare deux ou trois rotations quelconques côte à côte.
- Combler les lacunes connues de `docs/PROJECT.md` « Soil and water » : eau du sol au semis, cultures de
  couverture, USLE en t/ha. La pénalité de rendement du maïs après maïs est faite (Gagnon et al. 2019).

### W5. Données du producteur, avec consentement

- À écrire : une exportation des corrections, des dénombrements de pièges, des observations et des rendements du producteur dans un fichier unique qu'il
  peut partager ; un envoi anonymisé facultatif ; un script de réentraînement qui ajoute les étiquettes partagées.
- À modifier : `web/js/memory.js` (ce qui est stocké), `web/js/ui.js` (écran de consentement en mots simples).
- Règle : rien ne quitte l'appareil sans que le producteur le choisisse. Aucun compte n'est requis pour utiliser
  l'application.

### W6. Cartes de rendement

- À écrire : des importateurs pour les exportations courantes de moniteurs de rendement (shapefile, CSV, ISOXML) ; nettoyage (filtres de vitesse,
  de position de la tête de coupe et de chevauchement).
- Usage : comme étiquettes pour W1 lorsqu'elles sont partagées ; zones de rendement par champ dans la vue 3D.

### W7. Adaptateurs d'expansion

- À écrire : `src/taupin/regions/<region>.py`, chacun faisant correspondre les clés de couches de l'application aux sources de cette région
  (section 5) et déclarant les règles qui s'appliquent.
- À modifier : `src/taupin/engine.py` charge des seuils par région au lieu des constantes du RAP du Québec;
  `web/js/i18n*.js` ajoute des langues par région.

## 5. Données par région

| Couche | Québec (maintenant) | Canada | États-Unis | Monde |
|---|---|---|---|---|
| Relief | lidar HRDEM de RNCan, 1 m | HRDEM là où il existe, MNEC (CDEM) ailleurs | lidar USGS 3DEP | Copernicus DEM GLO-30, 30 m |
| Historique de cultures | Inventaire annuel des cultures d'AAC | idem | USDA NASS Cropland Data Layer | ESA WorldCereal ; historique saisi par le producteur |
| Vigueur | NASA HLS (Landsat 8/9, Sentinel-2) | idem | idem | idem |
| Chaleur du sol | thermique Landsat | idem | idem | idem |
| Sol | carte de l'IRDA, CanSIS | CanSIS, Soil Landscapes of Canada | SSURGO / gSSURGO | ISRIC SoilGrids 2.0 |
| Météo, pluie, humidité du sol | NASA POWER, GPM IMERG, SMAP | idem | idem | idem |
| Radar | ASC RCM (inclus dans la carte des cultures d'AAC) | couche directe RCM | Sentinel-1 | Sentinel-1 |
| Règles sur les ravageurs | RAP / MAPAQ | guides provinciaux | guides de vulgarisation des États | par pays, ou couche des ravageurs désactivée |
| Statistiques de rendement | Statistique Canada | idem | rendements par comté de l'USDA NASS | statistiques nationales |

Les couches de la NASA et de l'ESA (HLS, POWER, GPM, SMAP, Sentinel-1) sont mondiales, de sorte que le modèle de champ et les
scores de rotation s'appliquent d'une région à l'autre. Les parties régionales sont l'historique de cultures, les cartes des sols, le lidar et
les règles sur les ravageurs.

## 6. Phases

| Phase | Portée | Terminée quand |
|---|---|---|
| 1. Québec | W1, W2 (matière organique, texture, eau), W3 option A, W4 | un producteur trace un champ du Québec et obtient la vue 3D, des propriétés prédites avec plages et une comparaison de rotations quelconques, avec W1 ayant passé son critère |
| 2. Canada et États-Unis | adaptateurs W7 pour l'Ontario, les Prairies et la Corn Belt américaine ; W5 ; W6 | les critères de W1 et de W2 sont réussis sur des régions mises de côté dans chaque nouvelle zone |
| 3. Monde | W3 option B ; adaptateurs WorldCereal et SoilGrids ; couche des ravageurs par pays ou désactivée | les critères sont réussis sur des pays mis de côté ; chaque couche indique sa résolution et sa source |

Avant la phase 2 : tester avec deux ou trois producteurs québécois par l'entremise d'un club-conseil en agroenvironnement,
et modifier l'application selon leurs commentaires.

## 7. Ce qui en fait un outil pour les producteurs

- Il donne des chiffres, des plages et des compromis. Il ne dit pas au producteur quoi semer.
- Ce que le producteur saisit l'emporte sur le satellite, partout.
- Chaque chiffre a une source et une plage à un clic de distance ; « données insuffisantes » est une réponse valide.
- Aucun compte. Les données restent sur l'appareil, sauf si le producteur les partage.
- Fonctionne hors ligne une fois le champ construit. Français et anglais d'abord, puis les langues de chaque
  nouvelle région.
- Exportation d'une page pour l'agronome du producteur.

## 8. Risques

| Risque | Effet | Réponse |
|---|---|---|
| Le NDVI ne suit pas le rendement d'assez près | les prédictions de W1 induisent en erreur | critère de W1 ; cartes de rendement (W6) comme étiquettes |
| Les cartes des sols publiques sont grossières (SoilGrids 250 m) | les cartes des propriétés paraissent plus précises qu'elles ne le sont | plages affichées ; les analyses de sol du producteur l'emportent |
| Historique de cultures manquant hors du Canada et des États-Unis | variables de rotation faibles | le producteur saisit l'historique ; WorldCereal pour les années récentes |
| Les règles sur les ravageurs ne se transposent pas d'une région à l'autre | seuils erronés | couche des ravageurs par région, désactivée là où il n'y a pas de règles |
| L'exploitation d'un service de préparation coûte de l'argent | la 3D sur demande s'arrête | mettre en cache les champs construits ; constructeur dans le navigateur (W3 option B) |
| Confidentialité des données du producteur | perte de confiance | stockage local d'abord, partage volontaire, envoi anonymisé |

## 9. Points ouverts à vérifier

- Licence de chaque source régionale avant sa mise en service (conditions de l'IRDA non vérifiées, voir `DATA_SOURCES.md`).
- Jeux de données sur les limites de champs et leurs licences, pour la détection des limites de W3.
- Accès aux stations in situ d'humidité du sol au Canada et aux États-Unis pour le critère d'humidité de W2.
