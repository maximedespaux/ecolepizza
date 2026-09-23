/**
 * UNE PLAGE HORAIRE « hh:mm - hh:mm » — lue une fois, écrite partout pareil.
 *
 * Sert aux heures d'un intervenant externe sur une demi-journée (migration 181) : l'écran les
 * saisit dans deux champs `<input type="time">`, le serveur les range en colonnes `time`, et la
 * feuille d'émargement les imprime au-dessus de la signature.
 *
 * LES DEUX HEURES VONT ENSEMBLE, toujours. Une seule des deux ne dit rien d'exploitable — « il
 * est arrivé à 10 h » n'est pas une présence —, et la feuille ne saurait qu'en faire. Une plage
 * à moitié saisie est donc traitée comme une absence de plage : la demi-journée reste cochée,
 * la case reste muette, exactement comme avant la 181.
 *
 * MINUIT N'EST PAS UNE HEURE DE FORMATION, et « 00:00 » est précisément ce que rend un champ
 * vidé puis revalidé par certains navigateurs. Une fin qui n'est pas APRÈS le début est donc
 * refusée : c'est la seule règle de fond, et elle attrape aussi la plage inversée (14:00 - 09:00),
 * qui donnerait un volume horaire négatif sur la feuille.
 */

/** « 9:5 », « 09:05 », « 09:05:00 » → minutes depuis minuit ; sinon null. */
function enMinutes(v) {
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v ?? '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mn = Number(m[2]);
    if (h > 23 || mn > 59) return null;
    return h * 60 + mn;
}

/**
 * La plage telle qu'on la range en base, ou `null` si elle n'en est pas une.
 * @returns {{debut: string, fin: string}|null} deux « HH:MM:SS », prêts pour une colonne `time`.
 */
function lirePlage(debut, fin) {
    const d = enMinutes(debut);
    const f = enMinutes(fin);
    if (d == null || f == null || f <= d) return null;
    const hhmmss = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;
    return { debut: hhmmss(d), fin: hhmmss(f) };
}

/**
 * La plage telle qu'elle s'imprime : « 9h00 - 12h30 ». Chaîne VIDE si elle n'est pas complète —
 * la case de la feuille reste alors muette plutôt que d'annoncer une heure inventée.
 *
 * MÊME FORME QUE LA LIGNE « Horaires » de la feuille (cf. `fmtHM` dans lib/emargement) : deux
 * écritures différentes sur le même tableau se liraient comme deux informations différentes.
 */
function plageFr(debut, fin) {
    const p = lirePlage(debut, fin);
    if (!p) return '';
    const hm = (s) => `${Number(s.slice(0, 2))}h${s.slice(3, 5)}`;
    return `${hm(p.debut)} - ${hm(p.fin)}`;
}

module.exports = { lirePlage, plageFr, enMinutes };
