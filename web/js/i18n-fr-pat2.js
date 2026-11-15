// Second block of patterns: scouting record, photo check, notes and finds, map layers, model metrics.
// Same conventions as i18n-fr-pat.js (no closing full stop; sub() translates one group).
import { fixDates, pl, verbatim } from './i18n-fr-post.js';

const ISO = '\\d{4}-\\d{2}-\\d{2}';
const NUM = '(\\d[\\d.,]*)';
const ZONE = '(upland|low wet pocket)';
const RANK = { low: 'bas', middle: 'moyen', high: 'supérieur', mid: 'moyen' };
const rank = (w) => RANK[w.toLowerCase()];
const COVER = { low: 'faible', medium: 'moyenne', high: 'élevée' };
const DRAIN = {
  'very poorly drained': 'très mal drainé', 'poorly drained': 'mal drainé', 'imperfectly drained': 'imparfaitement drainé',
  'moderately well drained': 'modérément bien drainé', 'fairly well drained': 'assez bien drainé', 'well drained': 'bien drainé',
  'rapidly drained': 'rapidement drainé', 'excessively drained': 'excessivement drainé',
};
const parts = (s, sub) => s.split(', ').map(sub).join(', ');
const zoneFr = (z, sub) => (z ? `, ${sub(z)}` : '');

export const PATTERNS = [
  // Scouting counts
  [new RegExp(`^Lift (\\d): ${NUM} wireworms? in ${NUM} traps?, ${NUM} per trap(?:, lifted (${ISO}))?$`), (m) =>
    `Relevé ${m[1]}: ${m[2]} ${pl(m[2], 'ver fil-de-fer', 'vers fil-de-fer')} dans ${m[3]} ${pl(m[3], 'piège', 'pièges')}, ${m[4]} par piège${m[5] ? `, relevé le ${m[5]}` : ''}`],
  [/^Lift (\d+)$/, 'Relevé $1'],
  [/^Lift (\d+) on$/, 'Relevé $1 le'],
  [/^Wireworms in trap (\w+), lift (\d+)$/, 'Vers fil-de-fer dans le piège $1, relevé $2'],
  [/^Trap(\s+Zone\s+Latitude\s+Longitude\s+)(.*)$/, (m) => `Piège${m[1]}${m[2].replace(/Lift/g, 'Rel.')}`],
  [/^Remove photo (\d+)$/, 'Retirer la photo $1'],
  [new RegExp(`^Delete (.+) of (${ISO})$`), 'Supprimer $1 du $2'],
  [/^Written (.+)$/, 'Rédigé le $1'],
  [/^Dominant species entered: (.+) \(threshold (\S+) per trap per lift\)$/, 'Espèce dominante saisie: $1 (seuil de $2 par piège par relevé)'],
  [/^Bait traps \(at least (\d+) per field, about (\d+) m apart; (.+)\)$/, (m) =>
    `Pièges-appâts (au moins ${m[1]} par parcelle, à environ ${m[2]} m d'intervalle; ${verbatim(fixDates(m[3]))})`],
  [/^Lift (\d) is at or above the threshold of (\S+) per trap for (.+) \((\S+) per trap\)$/,
    'Le relevé $1 atteint ou dépasse le seuil de $2 par piège pour $3 ($4 par piège)'],
  [/^No lift at the threshold of (\S+) per trap for (.+) so far \(highest (\S+) per trap\)$/,
    'Aucun relevé n\'atteint le seuil de $1 par piège pour $2 jusqu\'ici (maximum de $3 par piège)'],
  [/^(\d) of 3 lifts counted: the method asks for three lifts, 7 to 10 days apart$/, (m) =>
    `${m[1]} ${pl(m[1], 'relevé', 'relevés')} sur 3 ${pl(m[1], 'compté', 'comptés')}: la méthode demande trois relevés, espacés de 7 à 10 jours`],
  [/^Three lifts counted, none at the threshold of (\S+) per trap for (.+) \(highest (\S+) per trap\)$/,
    'Trois relevés comptés, aucun n\'atteint le seuil de $1 par piège pour $2 (maximum de $3 par piège)'],
  [/^Lift (\d) has (\d+) of the (\d+) traps the method asks for$/, 'Le relevé $1 compte $2 des $3 pièges que demande la méthode'],

  // Field ranking
  [/^(Low|Middle|High|low|middle|high) third for (\d{4}) among the (\d+) Quebec fields the Taupin model was fitted on$/, (m) =>
    `Tiers ${rank(m[1])} pour ${m[2]} parmi les ${m[3]} parcelles du Québec sur lesquelles le modèle Taupin a été ajusté`],
  [/^(Low|Middle|High) third of the 82 training fields for (\d{4})$/, (m) => `Tiers ${rank(m[1])} des 82 parcelles d'entraînement pour ${m[2]}`],
  [/^Which fields to trap first: (low|middle|high) third for (\d{4})$/, (m) => `Parcelles à piéger en premier: tiers ${rank(m[1])} pour ${m[2]}`],

  // Photo check
  [/^Classifying (.+)…$/, (m, sub) => `Classification de ${sub(m[1])} en cours…`],
  [/^Classify (.+)$/, (m, sub) => `Classer ${sub(m[1])}`],
  [/^Best guess (.+) at (\S+) %, below the (\S+) % needed for an answer$/, 'Meilleure estimation: $1 à $2 %, sous le seuil de $3 % requis pour une réponse'],
  [/^Next: (.+)$/, (m, sub) => `Ensuite: ${m[1].replace(/(.+?) (\d[\d.]*) %(?:, |$)/g, (_, n, p) => `${sub(n)} ${p} %, `).replace(/, $/, '')}`],
  [/^Pinned in the (.+)\. Click the field to move it$/, 'Épinglé dans la $1. Cliquez sur le champ pour le déplacer'],
  [/^Suggested by the photo check: (.+)\. Change it if it is wrong$/, 'Suggéré par la vérification par photo: $1. Modifiez-le si c\'est inexact'],
  [/^unclear \(best guess (.+), (\d[\d.]*) %\)$/, (m, sub) => `incertain (meilleure estimation ${sub(m[1])}, ${m[2]} %)`],
  [/^unclear \(best guess (.+)\)$/, (m, sub) => `incertain (meilleure estimation ${sub(m[1])})`],
  [new RegExp(`^(.+?) \\((\\d[\\d.]*) %\\)(?:, (pest))?(?:, ${ZONE})?$`), (m, sub) =>
    `${sub(m[1])} (${m[2]} %)${m[3] ? ', ravageur' : ''}${zoneFr(m[4], sub)}`],

  // One saved find, then the sentences around it
  [new RegExp(`^(${ISO} \\d{2}:\\d{2}) UTC, (.+), (\\d+\\.\\d+) ([NS]), (\\d+\\.\\d+) ([EW])(?: \\(within (\\d+) m\\))?(?:, (from the photo GPS|at the pin on the field))?(?:, (\\d+) found)?$`), (m, sub) =>
    `${m[1]} UTC, ${sub(m[2])}, ${m[3]} ${m[4]}, ${m[5]} ${m[6]}${m[7] ? ` (à ${m[7]} m près)` : ''}${m[8] ? `, ${sub(m[8])}` : ''}${m[9] ? `, ${m[9]} ${pl(m[9], 'trouvé', 'trouvés')}` : ''}`],
  [/^(Saved on this device|Logged on this device|Added on this device|Kept for this visit only: this browser blocks storage): (.+)$/, (m, sub) => {
    const i = m[2].indexOf('. ');
    const head = i < 0 ? m[2] : m[2].slice(0, i);
    const tail = i < 0 ? '' : ` ${sub(m[2].slice(i + 2))}`;
    return `${sub(m[1])}: ${sub(head)}${i < 0 ? '' : '.'}${tail}`;
  }],
  [/^Delete all (\d+) entries from this device\?$/, 'Supprimer les $1 entrées de cet appareil?'],

  // Memory list
  [new RegExp(`^Soil insect: (.+?)(?:, (\\d+) found)?(?:, ${ZONE})?$`), (m, sub) =>
    `Insecte du sol: ${sub(m[1])}${m[2] ? `, ${m[2]} ${pl(m[2], 'trouvé', 'trouvés')}` : ''}${zoneFr(m[3], sub)}`],
  [/^(.+?), (\d+) found$/, (m, sub) => `${sub(m[1])}, ${m[2]} ${pl(m[2], 'trouvé', 'trouvés')}`],
  [new RegExp(`^(?:Ground cover, (low|medium|high)|(Standing water|Water channel|standing water|water channel))(?:, ${ZONE})?$`), (m, sub) =>
    `${m[1] ? `Couverture du sol, ${COVER[m[1]]}` : sub(m[2])}${zoneFr(m[3], sub)}`],
  [/^ground cover, (low|medium|high)$/, (m) => `couverture du sol, ${COVER[m[1]]}`],
  [new RegExp(`^(?:ground cover, (low|medium|high)|(standing water|water channel)), ${ZONE}$`), (m, sub) =>
    `${m[1] ? `couverture du sol, ${COVER[m[1]]}` : sub(m[2])}, ${sub(m[3])}`],
  [/^(\d+) standing-water notes?: that ground counts as a low wet pocket and the pest table opens on it\. Water shortfall is not changed$/, (m) =>
    `${m[1]} ${pl(m[1], 'note d\'eau stagnante', 'notes d\'eau stagnante')}: ce sol compte comme une dépression humide et le tableau des ravageurs s'ouvre sur elle. Le déficit en eau n'est pas modifié`],
  [/^(\d+) low-cover notes?: the soil-loss priority counts one more time$/, (m) =>
    `${m[1]} ${pl(m[1], 'note de faible couverture', 'notes de faible couverture')}: la priorité de perte de sol compte une fois de plus`],
  [/^(\d+) water-channel notes?: the soil-loss priority counts one more time$/, (m) =>
    `${m[1]} ${pl(m[1], 'note de rigole d\'écoulement', 'notes de rigole d\'écoulement')}: la priorité de perte de sol compte une fois de plus`],
  [/^(\d+) medium or high cover notes?: listed, and the ranking is not changed$/, (m) =>
    `${m[1]} ${pl(m[1], 'note de couverture moyenne ou élevée', 'notes de couverture moyenne ou élevée')}: ${pl(m[1], 'inscrite', 'inscrites')}, et le classement n'est pas modifié`],
  [/^The order changed\. Without the notes: (.+)\. With them: (.+)$/, (m, sub) =>
    `L'ordre a changé. Sans les notes: ${parts(m[1], sub)}. Avec les notes: ${parts(m[2], sub)}`],
  [/^The order is the same: (.+)\. The scores moved: (.+)$/, (m, sub) =>
    `L'ordre est le même: ${parts(m[1], sub)}. Les cotes ont bougé: ${parts(m[2], sub)}`],

  // Map layers and field facts
  [/^ACI class (\d+)$/, 'Classe ACI $1'],
  [/^(\S+) ha, traps (.+)$/, (m) => `${m[1]} ha, ${m[2] === 'none' ? 'aucun piège' : `${pl(m[2].split(', ').length, 'piège', 'pièges')} ${m[2]}`}`],
  [/^Map polygons \((.+?)\), drawn on (\d+) m cells$/, 'Polygones cartographiques ($1), tracés sur des cellules de $2 m'],
  [/^(\d+) m lidar, averaged to (\d+) m cells$/, 'Lidar de $1 m, moyenné en cellules de $2 m'],
  [/^Native (\d+) m, shown as (\d+) m cells$/, 'Résolution native de $1 m, affichée en cellules de $2 m'],
  [/^Open ground where traps can go: (\S+) ha$/, 'Terrain dégagé où les pièges peuvent aller: $1 ha'],
  [/^(.+?): a (\d+) m square at (\S+) N, (\S+) W(?:, with (\S+) ha of open ground where traps can go)?$/, (m) =>
    `${m[1]}: un carré de ${m[2]} m à ${m[3]} N, ${m[4]} W${m[5] ? `, avec ${m[5]} ha de terrain dégagé où les pièges peuvent aller` : ''}`],
  [/^Zone (\d+): wetness (\S+), NDVI (\S+), (\S+ °C), soil (.+)$/, 'Zone $1: humidité topographique $2, NDVI $3, $4, sol $5'],
  [/^mean of (\d+) clear June to August scenes$/, 'moyenne de $1 scènes sans nuage de juin à août'],
  [/^mean anomaly of (\d+) clear April and May scenes$/, 'anomalie moyenne de $1 scènes sans nuage d\'avril et mai'],
  [/^Western corn rootworm egg hatch: (\d+) soil degree-days above (\S+) C from (.+)$/, (m) =>
    `Éclosion des œufs de la chrysomèle des racines du maïs: ${m[1]} degrés-jours du sol au-dessus de ${m[2]} °C à partir du ${m[3]}`],
  [new RegExp(`^(.+?): (${Object.keys(DRAIN).join('|')})(?:; (organic|mineral), surface layer (\\d+-\\d+) cm: (.+))?$`), (m, sub) =>
    `${m[1]}: ${DRAIN[m[2]]}${m[3] ? `; ${m[3] === 'organic' ? 'organique' : 'minéral'}, couche de surface de ${m[4]} cm: ${sub(m[5])}` : ''}`],
  [/^(.+ \| .+)$/, (m, sub) => (/: (very |)poorly|drained/.test(m[1]) ? m[1].split(' | ').map(sub).join(' | ') : null)],
  [/^(organic|mineral), surface layer (\d+-\d+) cm: (.+)$/, (m, sub) => `${m[1] === 'organic' ? 'organique' : 'minéral'}, couche de surface de ${m[2]} cm: ${sub(m[3])}`],
  [/^under (\d+) m of canopy, at least (\d+)% such cells in the (\d+) m around, summer NDVI of (\S+) or more, on a mapped soil unit, inside the park, (\d+) m from the edge of the square \(Taupin choices\)$/,
    'sous moins de $1 m de couvert, au moins $2 % de telles cellules dans les $3 m environnants, NDVI estival de $4 ou plus, sur une unité de sol cartographiée, dans le parc, à $5 m du bord du carré (choix de Taupin)'],
  [/^end value (\S+) to (\S+) in FAO-56; (\S+) used$/, 'valeur finale de $1 à $2 dans la FAO-56; $3 utilisée'],
  [/^(\S+) % organic carbon$/, '$1 % de carbone organique'],
  [/^(\S+) % clay, (\S+) % organic carbon$/, '$1 % d\'argile, $2 % de carbone organique'],
  [/^(\S+) % sand, (\S+) % clay, (\S+) % organic carbon$/, '$1 % de sable, $2 % d\'argile, $3 % de carbone organique'],
  [/^Map polygons \((.+?)\), drawn on (\d+) m cells\. (.+)$/, (m, sub) => `Polygones cartographiques (${m[1]}), tracés sur des cellules de ${m[2]} m. ${sub(m[3])}`],

  // Crop history
  [new RegExp(`^Crop history, (\\d{4}) to (\\d{4})$`), 'Historique des cultures, $1 à $2'],
  [/^Last year: ([^.]+?)(?:, (\d+) % of the open cells)?$/, (m, sub) => `L'an dernier: ${sub(m[1])}${m[2] ? `, ${m[2]} % des cellules dégagées` : ''}`],
  [/^(\d{4}): (.+), (\d+) % of the open cells$/, (m, sub) => `${m[1]}: ${sub(m[2])}, ${m[3]} % des cellules dégagées`],
  [/^Closest rotation: (.+) \((\d+)(?: of (\d+))? recent years agree\), preset below$/, (m, sub) => m[3]
    ? `Rotation la plus proche: ${sub(m[1])} (${m[2]} des ${m[3]} dernières années concordent), présélectionnée ci-dessous`
    : `Rotation la plus proche: ${sub(m[1])} (${m[2]} ${pl(m[2], 'année récente concorde', 'années récentes concordent')}), présélectionnée ci-dessous`],
  [/^(AAFC Annual Crop Inventory, .+); crop = most common class over the open cells$/, (m) => `${verbatim(m[1])}; culture = classe la plus fréquente sur les cellules dégagées`],
  [/^canopy height = lidar DSM minus DTM; a crown is drawn at each (\d+) m local maximum above (\d+) m, inside the outline$/,
    'hauteur du couvert = MNS lidar moins MNT; une couronne est tracée à chaque maximum local de $1 m au-dessus de $2 m, à l\'intérieur du contour'],
  [/^Monthly means, (\d+) months from (.+)$/, 'Moyennes mensuelles, $1 mois depuis $2'],
  [/^Grass or forage years in the last five: (\d+), preset in the field rank$/, 'Années en herbe ou en fourrage parmi les cinq dernières: $1, présélectionnées dans le classement des parcelles'],
  [/^Corn years in a row at the end: (\d+)$/, 'Années de maïs consécutives à la fin: $1'],

  // Model metrics
  [/^(\d+) Quebec fields \((.+)\), (\d+) at or above 1 wireworm per trap$/, (m) =>
    `${m[1]} parcelles du Québec (${verbatim(m[2])}), dont ${m[3]} à 1 ver fil-de-fer par piège ou plus`],
  [/^AUC (\S+) leaving one field out \(95 % CI (\S+) to (\S+)\), (\S+) leaving one year out, (\S+) leaving one region out$/,
    'AUC $1 en laissant une parcelle de côté (IC à 95 %, $2 à $3), $4 en laissant une année de côté, $5 en laissant une région de côté'],
  [/^The RAP rule count scores (\S+) on the same fields$/, 'La règle de dénombrement du RAP obtient $1 sur les mêmes parcelles'],
  [/^Brier score (\S+) against (\S+) for the base rate$/, 'Score de Brier de $1, contre $2 pour le taux de base'],
  [/^From (\S+) \((.+)\)\. "Answered" is the share of photos above the abstain threshold$/, 'Source: $1 ($2). « Répondu » est la part des photos au-dessus du seuil d\'abstention'],

  [/^(\d+) traps, lettered as flags A to J, closest pair (\d+) m apart$/, '$1 pièges, désignés par des fanions de A à J, paire la plus rapprochée à $2 m d\'intervalle'],
  [/^Here: traps split by zone area with at least one per zone, inside the park, (\d+) m from the edge of the square, on ground under (\d+) m of canopy \(Taupin choices\)$/,
    'Ici: pièges répartis selon la superficie des zones, au moins un par zone, dans le parc, à $1 m du bord du carré, sur un sol sous moins de $2 m de couvert (choix de Taupin)'],
  [/^The rotation table uses projections for (\d{4}) to (\d{4}), one per rotation year, from the model with the smallest backtest miss \((.+)\)$/, (m, sub) =>
    `Le tableau des rotations utilise des projections pour ${m[1]} à ${m[2]}, une par année de rotation, issues du modèle dont l'écart au rétrotest est le plus faible (${parts(m[3], sub)})`],
  [/^mean of all past years$/, 'moyenne de toutes les années passées'],
  [/^mean of the last (\d+) years$/, 'moyenne des $1 dernières années'],
  [/^the table below is the (\d{4}) to (\d{4}) history they rest on$/, 'le tableau ci-dessous présente l\'historique de $1 à $2 sur lequel elles reposent'],

  // Charts
  [/^(.+) by month, (\d[\d., ]*)$/, (m, sub) => `${sub(m[1])}, par mois, ${m[2].split(', ').join('; ')}`],
  [/^Soil temperature 0-10 cm, 1 March to 31 July, (\d{4})-(\d{4}), with the 8 and 12 degree lines$/,
    'Température du sol à 0-10 cm, du 1er mars au 31 juillet, $1-$2, avec les lignes de 8 et 12 degrés'],

  // Drawing the 3D field
  [/^Height drawn (\d+) times?, trees at their lidar height; the cut edge marks 10 cm, the depth the trap date is read at$/,
    'Hauteur dessinée $1 fois, arbres à leur hauteur lidar; l\'arête de coupe marque 10 cm, la profondeur à laquelle la date de piégeage est lue'],
  // Soil organic matter card (organic.js)
  [/^([\d.]+) % organic matter(?: on ([\d.]+) of ([\d.]+) ha)?(?: \(low wet pocket ([\d.]+) %, upland ([\d.]+) %\))?\. (?:([\d.]+) ha over the (\d+) % wireworm risk level|Under the (\d+) % wireworm risk level)$/, (m) => {
    const c = v => v.replace('.', ',');
    return `${c(m[1])} % de matière organique${m[2] ? ` sur ${c(m[2])} des ${c(m[3])} ha` : ''}${m[4] ? ` (dépression humide ${c(m[4])} %, zone haute ${c(m[5])} %)` : ''}. ` +
      (m[6] ? `${c(m[6])} ha au-dessus du seuil de risque taupin de ${m[7]} %` : `Sous le seuil de risque taupin de ${m[8]} %`);
  }],
  [/^([\d.]+) % organic matter, 0-30 cm$/, '$1 % de matière organique, 0-30 cm'],
  [/^(?:Both agree within 2 points|They differ by ([\d.]+) points)\. A lab test is better than both$/, (m) =>
    `${m[1] ? `Elles diffèrent de ${m[1].replace('.', ',')} points` : 'Les deux concordent à 2 points près'}. Une analyse de laboratoire vaut mieux que les deux`],
  [/^Organic matter = organic carbon x ([\d.]+)\. Sources: AAFC soil survey \(1950s, 1:20 000\) and ISRIC SoilGrids \(250 m\)$/, (m) =>
    `Matière organique = carbone organique x ${m[1].replace('.', ',')}. Sources: étude pédologique d'AAC (années 1950, 1:20 000) et ISRIC SoilGrids (250 m)`],
  [/^ ?([\d.]+) % organic matter on the ([\d.]+) of ([\d.]+) ha that have a carbon value(?: \(low wet pocket ([\d.]+) %, upland ([\d.]+) %\))?\. (?:([\d.]+) ha is over (\d+) %, a RAP wireworm risk factor|No part is over the RAP wireworm factor of (\d+) %)$/, (m) => {
    const c = v => v.replace('.', ',');
    return `${c(m[1])} % de matière organique sur les ${c(m[2])} ha de ${c(m[3])} qui ont une valeur de carbone` +
      (m[4] ? ` (dépression humide ${c(m[4])} %, zone haute ${c(m[5])} %)` : '') + '. ' +
      (m[6] ? `${c(m[6])} ha dépasse ${m[7]} %, un facteur de risque du RAP pour les vers fil-de-fer` : `Aucune partie ne dépasse le facteur du RAP de ${m[8]} % pour les vers fil-de-fer`);
  }],
  [/^ ?([\d.]+) % organic matter, 0-30 cm \((.+)\)$/, (m) => ` ${m[1].replace('.', ',')} % de matière organique, 0-30 cm (` +
    m[2].replace(/([\d.]+) % carbon, ([\d.]+) to ([\d.]+)/g, (_, a, b, d) => `${a} % de carbone, ${b} à ${d}`).replace(/(\d)\.(\d)/g, '$1,$2') + ')'],
  [/^SoilGrids at the parcel centre:$/, 'SoilGrids au centre de la parcelle:'],
  [/^SoilGrids at your point (.+):$/, 'SoilGrids à votre point $1:'],
  [/^The two sources (?:agree within 2 points|differ by ([\d.]+) points)\. SoilGrids is a 250 m machine-learning map; the survey is 1:20 000 polygons from the 1950s\. A lab test of the field replaces both$/, (m) =>
    `Les deux sources ${m[1] ? `diffèrent de ${m[1].replace('.', ',')} points` : 'concordent à 2 points près'}. SoilGrids est une carte d'apprentissage automatique à 250 m; l'étude pédologique est faite de polygones au 1:20 000 des années 1950. Une analyse de laboratoire du champ remplace les deux`],
  [/^(Upland|Low wet pocket): organic matter ([\d.]+) % from the (soil survey|SoilGrids 0-30 cm), (over|under) the RAP factor of (\d+) %$/, (m) =>
    `${m[1] === 'Upland' ? 'Zone haute' : 'Dépression humide'}: matière organique ${m[2].replace('.', ',')} % selon ${m[3] === 'soil survey' ? 'l\'étude pédologique' : 'SoilGrids 0-30 cm'}, ${m[4] === 'over' ? 'au-dessus' : 'sous'} le facteur du RAP de ${m[5]} %`],
  [/^[\d.]+ %(?:, [\d.]+ %)*$/, (m) => m[0].replace(/(\d)\.(\d)/g, '$1,$2')],
  // Build your own rotation: the farmer's names stay as typed
  // The default name (custom.js addCustom) is translated; a name the farmer typed is not.
  [/^((?:\d+\. )?)My rotation (\d+)$/, (m) => `${m[1]}Ma rotation ${m[2]}`],
  [/^(.+) \(yours\)$/, (m) => `${m[1].replace(/(^|\d\. )My rotation (\d+)$/, '$1Ma rotation $2')} (la vôtre)`],
  [/^Added "(.+)": it is in the table and the cards below\.?$/, (m) => `« ${m[1]} » ajoutée: elle figure dans le tableau et les fiches ci-dessous`],
  [/^Remove (.+)$/, (m) => `Retirer ${m[1]}`],
  [/^Your own rotation \((.+)\), scored by the same rules and data as the others\.?$/, (m, sub) =>
    `Votre propre rotation (${m[1].split(', ').map(sub).join(', ')}), évaluée avec les mêmes règles et les mêmes données que les autres`],
  [/^(\d{4}) \((.+?)\): (.+)$/, (m, sub) => `${m[1]} (${sub(m[2])}): ${sub(m[3])}`],
  [/^Corn after corn in (.+): corn rootworm moderate or high$/, 'Maïs sur maïs en $1: chrysomèle des racines moyenne ou élevée'],
  [/^Wireworm high in (.+): bait traps before buying seed$/, 'Vers fil-de-fer élevés en $1: pièges-appâts avant d\'acheter la semence'],
  [/^The rules would support a coated-seed prescription in (.+); the agronomist decides$/, 'Les règles justifieraient une prescription de semences traitées en $1; l\'agronome décide'],
];
