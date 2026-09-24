/**
 * LE TEXTE D'UNE FORMATION GARDE SA FORME DANS LES DOCUMENTS (demandé le 2026-09-24).
 *
 * Objectifs, prérequis, déroulé, public, durée : l'organisme les écrit ligne par ligne, avec des puces
 * (« - », « • », « * », « – »). Inséré tel quel dans le HTML d'un document, un saut de ligne ne vaut
 * qu'une espace — LibreOffice le replie comme un navigateur : « - Connaître… - Citer… » sur une seule
 * ligne, et « Lundi… Mardi… Vendredi… » d'un seul tenant. On rend donc la STRUCTURE :
 *   · des lignes à puce qui se suivent → une vraie liste ;
 *   · toute autre ligne → sa propre ligne ; une ligne vide → un espacement.
 * Deux rendus, selon la place du jeton (lib/htmlfill.js) :
 *   · SEUL dans son paragraphe → des paragraphes et des listes, dans le style de ce paragraphe ;
 *   · DANS une phrase (« Durée : {DuréeDétail} ») → des sauts de ligne : une liste ne peut pas vivre
 *     à l'intérieur d'un paragraphe.
 * Un texte d'une seule ligne, sans puce, se rend exactement comme avant. Le texte est échappé ligne à
 * ligne : ce module ne produit jamais d'autres balises que les siennes.
 */

// Les jetons dont le texte a une forme : ceux des formations, nommés ou par « Champs documents ».
const COLONNES = ['objectives', 'prerequisites', 'program_detail', 'objective_general', 'duration_detail', 'audience'];
const JETONS_A_FORME = new Set(['Objectifs', 'Prérequis', 'Déroulé', 'ObjectifG', 'DuréeDétail', 'Public',
    ...COLONNES.map((c) => `field:training_program.${c}`)]);

/* Une puce : le signe en tête de ligne, suivi d'une espace ou directement d'une lettre (« -Citer »).
   Jamais d'un chiffre : « -12h00 » ou « -5 % » restent du texte. */
const PUCE = /^\s*[-–—•*·▪◦](?=\s|[A-Za-zÀ-ÖØ-öø-ÿ])\s*/;

const echapper = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Le texte en blocs : { liste: [items] } | { ligne: texte } | { vide: true }. */
function blocsDuTexte(texte) {
    const blocs = [];
    for (const brut of String(texte == null ? '' : texte).replace(/\r\n?/g, '\n').split('\n')) {
        const ligne = brut.trim();
        const der = blocs[blocs.length - 1];
        if (!ligne) { if (der && !der.vide) blocs.push({ vide: true }); continue; }
        if (PUCE.test(ligne)) {
            const item = ligne.replace(PUCE, '');
            if (der && der.liste) der.liste.push(item); else blocs.push({ liste: [item] });
        } else blocs.push({ ligne });
    }
    while (blocs.length && blocs[blocs.length - 1].vide) blocs.pop();
    return blocs;
}

/** Y a-t-il une forme à rendre ? Une seule ligne sans puce se rend comme avant, à l'identique. */
const aUneForme = (texte) => /\n/.test(String(texte == null ? '' : texte).trim()) || PUCE.test(String(texte == null ? '' : texte));

/** DANS une phrase : une ligne par ligne, les puces en « • ». */
function texteEnLignes(texte) {
    if (!aUneForme(texte)) return echapper(texte);
    const lignes = [];
    for (const b of blocsDuTexte(texte)) {
        if (b.vide) lignes.push('');
        else if (b.ligne) lignes.push(echapper(b.ligne));
        else for (const item of b.liste) lignes.push(`• ${echapper(item)}`);
    }
    return lignes.join('<br>');
}

/**
 * SEUL dans son paragraphe : des paragraphes et de vraies listes, qui reprennent les attributs du
 * paragraphe d'origine (interligne…) et les balises qui entouraient le jeton (taille, police…). Même
 * forme de liste que l'éditeur (`<li><p>…</p></li>`) : elle se rend comme les listes déjà écrites dans
 * le modèle. Une ligne vide donne un paragraphe vide, que fillHtml garnit d'une espace insécable.
 */
function texteEnBlocs(texte, attrsP = '', ouvrants = '', fermants = '') {
    const p = (html) => `<p${attrsP}>${ouvrants}${html}${fermants}</p>`;
    return blocsDuTexte(texte).map((b) => {
        if (b.vide) return `<p${attrsP}></p>`;
        if (b.ligne) return p(echapper(b.ligne));
        return `<ul>${b.liste.map((item) => `<li>${p(echapper(item))}</li>`).join('')}</ul>`;
    }).join('');
}

module.exports = { JETONS_A_FORME, PUCE, blocsDuTexte, aUneForme, texteEnLignes, texteEnBlocs };
