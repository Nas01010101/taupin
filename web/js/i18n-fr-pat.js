// Ordered [RegExp, replacement] pairs for strings that carry numbers, dates or names.
// A string replacement uses $1..$9; each group is translated on its own when it is a known phrase.
// A function replacement receives (match, sub) where sub(group) translates a group.
// Patterns are written without the closing full stop: i18n.js strips it and puts it back.
import { pl } from './i18n-fr-post.js';

const MON = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE = `(?:\\d{1,2} ${MON}(?: \\d{4})?|${MON} \\d{1,2})`;
const ISO = '\\d{4}-\\d{2}-\\d{2}';
const NUM = '(\\d[\\d.,]*)';
const CROP = { corn: 'le maïs', soybean: 'le soya', wheat: 'le blé', buckwheat: 'le sarrasin', barley: 'l’orge', oat: 'l’avoine', canola: 'le canola' };

export const PATTERNS = [
  // Active crop field check (cropcheck.js)
  [/^Active crop field: (\d+) % of ([\d.]+) ha under trees of 3 m or more(?:, ([\d.]+) ha open)?$/, (m) => `Champ en culture: ${m[1]} % de ${m[2]} ha sous des arbres de 3 m ou plus${m[3] ? `, ${m[3]} ha à découvert` : ''}`],
  [/^Not an active crop field: (\d+) % of ([\d.]+) ha under trees of 3 m or more(?:, ([\d.]+) ha open)?\. Rotation results here only demonstrate the app$/, (m) => `Pas un champ en culture: ${m[1]} % de ${m[2]} ha sous des arbres de 3 m ou plus${m[3] ? `, ${m[3]} ha à découvert` : ''}. Ici, les résultats des rotations servent seulement à montrer l’application`],
  // Trap week and trap plan
  [/^(\d)\. Trap week (\d{4}): set bait traps around (.+)$/, '$1. Semaine de piégeage $2: installez les pièges-appâts vers le $3'],
  [/^(\d)\. Trap week: set bait traps around (.+)$/, '$1. Semaine de piégeage: installez les pièges-appâts vers le $2'],
  [/^Have traps ready by (.+)$/, 'Ayez les pièges prêts au plus tard le $1'],
  [/^most likely around (.+?) \(by (.+?) in 9 years out of 10\)\. (.+)$/, 'vraisemblablement vers le $1 (au plus tard le $2, 9 années sur 10). $3'],
  [new RegExp(`^on (${DATE}(?:, ${DATE})*) \\(RAP: three counts 7 to 10 days apart\\)$`), (m) => {
    const d = m[1].split(', ');
    const list = d.length > 1 ? `${d.slice(0, -1).join(', ')} et ${d.at(-1)}` : d[0];
    return `les ${list} (RAP: trois dénombrements espacés de 7 à 10 jours)`;
  }],
  [/^The count decides the (\d{4}) seed$/, 'Le dénombrement décide des semences de $1'],
  [/^Soil at 0 to 10 cm holds 12 °C for a week around (.+?) \(NASA POWER TSOIL1, (\d{4}) to (\d{4})\); (.+?) in (\d{4})$/, 'Le sol à 0-10 cm se maintient à 12 °C pendant une semaine vers le $1 (NASA POWER TSOIL1, $2 à $3); le $4 en $5'],
  [/^The week the top 10 cm of soil reaches 12 °C, likely between (.+?) and (.+?)\. Forecast from NASA POWER, (\d{4}-\d{4})(?: at (.+))?$/, (m, sub) =>
    `La semaine où les 10 premiers cm de sol atteignent 12 °C, vraisemblablement entre le ${m[1]} et le ${m[2]}. Prévision à partir de NASA POWER, ${m[3]}${m[4] ? ` à ${sub(m[4])}` : ''}`],
  [/^This date and the ranking below are for (.+), not for the square above$/, 'Cette date et le classement ci-dessous valent pour $1, et non pour le carré ci-dessus'],
  [new RegExp(`^(${DATE}) in (\\d{4})$`), '$1 en $2'],
  [/^in (\d{4})$/, 'en $1'],
  [new RegExp(`^(${DATE}) to (${DATE})$`), 'du $1 au $2'],
  [new RegExp(`^(${ISO}) to (${ISO})$`), 'du $1 au $2'],
  [new RegExp(`^(${DATE})$`), '$1'],
  [/^(\d{4}) to (\d{4})$/, '$1 à $2'],
  [/^A wireworm or click beetle was photographed\. Set bait traps from (.+?) \(mean\) and count larvae per trap$/, 'Un ver fil-de-fer ou un taupin a été photographié. Installez les pièges-appâts à partir du $1 (moyenne) et comptez les larves par piège'],
  [/^Trend ([+\-−]?[\d.]+) ± ([\d.]+) days per decade \(95 %\): no clear shift$/, 'Tendance $1 ± $2 jours par décennie (95 %): aucun déplacement net'],
  [/^Trend ([+\-−]?[\d.]+) ± ([\d.]+) days per decade \(95 %\)$/, 'Tendance $1 ± $2 jours par décennie (95 %)'],
  [/^Forecast: four models \((.+), mean backtest miss\) were fit on the years up to each year from the 11th on and asked for the next 1 to 5 years\. The one with the smallest miss is used: (.+?)\. (The range .+)$/, (m, sub) =>
    `Prévision: quatre modèles (${m[1].replace(/(\d) d\b/g, '$1 j')}, écart moyen en validation rétrospective) ajustés sur les années précédant chaque année, à partir de la 11e, puis appelés à prédire les 1 à 5 années suivantes. Celui dont l’écart est le plus faible est utilisé: ${sub(m[2])}. ${sub(m[3])}`],
  [/^Forecast, 80 % range under each date \(backtested on (.+)\)$/, 'Prévision, fourchette de 80 % sous chaque date (validée rétrospectivement sur $1)'],
  [/^Arrows show the engine's level if bait traps then reach (.+?) larvae per trap \((.+?)\)\. Prescription would be supportable in (\d+) of (\d+) cells, against (\d+) now\. (.+)$/, (m, sub) =>
    `Les flèches montrent le niveau du moteur si les pièges-appâts atteignent alors ${m[1]} larves par piège (${m[2]}). La prescription serait justifiable dans ${m[3]} cellules sur ${m[4]}, contre ${m[5]} actuellement. ${sub(m[6])}`],

  // Risk traces
  [/^CRW: (\d+) prior corn year\(s\) -> (\w+)$/, 'CRM: $1 année(s) de maïs antérieure(s) → $2'],
  [/^WW factor: grass history \(years since sod=(\d+), grass run=(\d+)\)$/, 'Facteur VFF: historique de graminées (années depuis la prairie=$1, suite de graminées=$2)'],
  [/^WW factor: organic matter > (\d+) %$/, 'Facteur VFF: matière organique > $1 %'],
  [/^WW trap mean (\S+) vs threshold (\S+)\/trap \((.+)\)$/, 'VFF: moyenne des pièges $1 contre un seuil de $2/piège ($3)'],
  [/^WW (-\d): previous buckwheat slows larval growth\/survival, not a biofumigant$/, 'VFF $1: le sarrasin précédent ralentit la croissance et la survie des larves, sans être un biofumigant'],
  [/^Prescription (supportable|not supported) for (\w+)$/, (m) =>
    `Prescription ${m[1] === 'supportable' ? 'justifiable' : 'non justifiée'} pour ${CROP[m[2]] ?? m[2]}`],
  [/^(Upland|Low wet pocket), (.+?), OM ([\d.]+) %( \(to be measured\))?$/, (m, sub) =>
    `${sub(m[1])}, ${sub(m[2])}, MO ${m[3]} %${m[4] ? ' (à mesurer)' : ''}`],
  [/^(.+), (\d{4}) \((corn|soybean|wheat|buckwheat)\)$/, (m, sub) => `${sub(m[1])}, ${m[2]} (${CROP[m[3]].slice(3)})`],
  [/^Ranked after the fully scored rotations: no value for (.+) in at least one year$/, 'Classées après les rotations entièrement évaluées: aucune valeur pour $1 pendant au moins une année'],
  [/^(\d) of 5 years have no sourced value$/, (m) => `${m[1]} des 5 années ${pl(m[1], 'n’a', 'n’ont')} aucune valeur sourcée`],
  [/^(.+?): no sourced (.+)$/, (m, sub) => {
    const what = {
      'water use (Kc)': 'aucune consommation d’eau (Kc) sourcée', 'season length': 'aucune durée de saison sourcée',
      'nitrogen need': 'aucun besoin en azote sourcé', 'nitrogen left for the next crop': 'aucun azote laissé à la culture suivante sourcé',
      'Quebec yield': 'aucun rendement québécois sourcé', 'residue ratio': 'aucun ratio de résidus sourcé',
    }[m[2]];
    return what ? `${sub(m[1])}: ${what}` : null;
  }],
  [/^(Buckwheat|Soybean|Corn|Wheat|Barley|Oats|Canola): (assumption: .+|the initial value .+)$/, '$1: $2'],
  [/^(Soybean|Canola) right after buckwheat: (.+) \[(.+)\]$/, (m, sub) =>
    `${sub(m[1])} juste après le sarrasin: ${sub(m[2])} [${m[3]}]`],

  [/^(Soybean|Canola) right after buckwheat: (.+)$/, (m, sub) =>
    `${sub(m[1])} juste après le sarrasin: ${sub(m[2])}`],
  [/^(.+)\. NASA rain and soil data fetched (\S+)\.$/, (m, sub) => `${sub(m[1]) ?? m[1]}. Données de pluie et de sol NASA obtenues le ${m[2]}.`],
  [/^(.+)\. NASA data for the demo field\.$/, (m, sub) => `${sub(m[1]) ?? m[1]}. Données NASA du champ de démonstration.`],
  [/^(.+)\. NASA POWER sent no rain here, so the demo field's rain is used\.$/, (m, sub) => `${sub(m[1]) ?? m[1]}. NASA POWER n'a pas envoyé de pluie ici : la pluie du champ de démonstration est utilisée.`],
  [/^NASA rain and soil data fetched (\S+)\.$/, 'Données de pluie et de sol NASA obtenues le $1.'],
  [/^Picked (.+)\.$/, 'Point choisi : $1.'],

  // Rotation comparison sentences
  [new RegExp(`^${NUM} mm (less|more) water short per year in a dry year$`), (m) =>
    `Déficit en eau ${m[2] === 'less' ? 'inférieur' : 'supérieur'} de ${m[1]} mm par année sèche`],
  [new RegExp(`^USLE cover factor ${NUM} against ${NUM}: soil loss ${NUM} % (lower|higher) on the same slope$`), (m) =>
    `Facteur de couverture USLE ${m[1]} contre ${m[2]}: perte de sol ${m[4] === 'lower' ? 'inférieure' : 'supérieure'} de ${m[3]} % sur la même pente`],
  [new RegExp(`^${NUM} (fewer|more) heavy-rain days on bare soil over five years$`), (m) =>
    `${m[1]} ${pl(m[1], 'jour', 'jours')} de pluie forte de ${m[2] === 'fewer' ? 'moins' : 'plus'} sur sol nu en cinq ans`],
  [new RegExp(`^${NUM} kg N/ha (less|more) nitrogen to buy over five years$`), (m) =>
    `${m[1]} kg N/ha d’azote ${m[2] === 'less' ? 'de moins' : 'de plus'} à acheter en cinq ans`],
  [new RegExp(`^${NUM} t/ha (more|less) crop residue a year$`), (m) =>
    `${m[1]} t/ha de résidus de culture ${m[2] === 'more' ? 'de plus' : 'de moins'} par année`],
  [new RegExp(`^${NUM} (fewer|more) pest points over five years \\(wireworm and rootworm levels\\)$`), (m) =>
    `${m[1]} ${pl(m[1], 'point', 'points')} de ravageurs ${m[2] === 'fewer' ? 'de moins' : 'de plus'} en cinq ans (niveaux de vers fil-de-fer et de chrysomèle)`],
  [new RegExp(`^${NUM} (short|spare)$`), (m) => `${m[1]} en ${m[2] === 'short' ? 'déficit' : 'surplus'}`],
  [/^([+\-−]?[\d.]+) from notes$/, '$1 selon les notes'],
  [/^moved from (\d+)$/, 'était au rang $1'],
  [/^Year (\d+)$/, 'Année $1'],

  // Climate and soil moisture
  [/^Daily rain from NASA GPM IMERG and air temperature from NASA POWER, (\d{4}) to (\d{4}) \((\d+) years\) at (.+)$/, 'Pluie quotidienne de NASA GPM IMERG et température de l’air de NASA POWER, $1 à $2 ($3 ans) à $4'],
  [new RegExp(`^GPM IMERG rain at this point averages ${NUM} mm a year \\((\\d+) years\\)$`), 'La pluie GPM IMERG à ce point est en moyenne de $1 mm par année ($2 ans)'],
  [/^Heavy rain is a day with (\d+) mm or more, April to November, before about (\d+) % crop cover or after harvest$/, 'La pluie forte est une journée de $1 mm ou plus, d’avril à novembre, avant environ $2 % de couvert végétal ou après la récolte'],
  [/^Monthly means, (\d+) months from April 2015\. The month-to-month departures from the usual of the two datasets correlate at r = ([\d.]+)(,?)$/, 'Moyennes mensuelles, $1 mois à partir d’avril 2015. Les écarts d’un mois à l’autre par rapport à la normale des deux jeux de données sont corrélés à r = $2$3'],
  [/^so the POWER wetness input of the field ranking follows the satellite-constrained SMAP analysis\. Driest months in SMAP: (.+)$/, (m) =>
    `de sorte que l’humidité POWER utilisée dans le classement des champs suit l’analyse SMAP contrainte par satellite. Mois les plus secs dans SMAP: ${m[1].replace(/\(([-+−]?[\d.]+) m3\/m3 below that month's mean\)/g, '($1 m3/m3 sous la moyenne de ce mois)')}`],
  [/^NASA GPM rain (\S+) mm in 7 days \(([^()]+)\)$/, 'Pluie NASA GPM $1 mm en 7 jours ($2)'],
  [/^SMAP root-zone moisture (\S+) m3\/m3 \(([^()]+)\)$/, 'Humidité de la zone racinaire SMAP $1 m3/m3 ($2)'],
  [/^usual for this week, (\d+) years$/, 'normale de cette semaine, $1 ans'],
  [/^usual for this month$/, 'normale de ce mois'],

  // Own field and field buttons
  [/^Showing (.+?), fetched (\S+)\. (.+)$/, 'Affichage de $1, données obtenues le $2. $3'],
  [/^Showing the demo field, (.+)$/, 'Affichage du champ de démonstration, $1'],
  [/^Showing (.+)$/, 'Affichage de $1'],
  [/^No dates for (.+?): (.+?)\. The page still shows (.+)$/, 'Aucune date pour $1: $2. La page affiche toujours $3'],
  [/^(.+) with the demo park's NASA dates$/, '$1 avec les dates NASA du parc de démonstration'],
  [/^Could not start: (.+)$/, 'Démarrage impossible: $1'],
  [/^Could not classify\. (.+)$/, 'Classification impossible. $1'],
  [/^NASA POWER answered (\d+)$/, 'NASA POWER a répondu $1'],
  [/^The 3D field and trap points are (.+), baked from lidar, satellite and crop maps$/, 'Le champ en 3D et les points de piégeage sont ceux de $1, préparés à partir du lidar, de données satellitaires et de cartes des cultures'],
  [/^A baked 3D field, (.+?), is ([\d.]+) km away: open it with the Quebec fields buttons above$/, 'Un champ 3D préparé, $1, se trouve à $2 km: ouvrez-le avec les boutons des champs du Québec ci-dessus'],
  [/^(\d+) entr(?:y|ies) saved on this device: (\d+) photo notes? and (\d+) insect finds?$/, (m) =>
    `${m[1]} ${pl(m[1], 'entrée enregistrée', 'entrées enregistrées')} sur cet appareil: ${m[2]} ${pl(m[2], 'note de photo', 'notes de photo')} et ${m[3]} ${pl(m[3], 'insecte trouvé', 'insectes trouvés')}`],
];
