/**
 * Qui parle : avatar, cadre et parcours d'un auteur — pour TOUTES les listes de la Communauté.
 *
 * POURQUOI CE FICHIER. La résolution existait, écrite une fois, dans `listPosts`. Elle a été
 * réclamée ensuite par les RÉPONSES d'une question et par les COMMENTAIRES d'une fiche : trois
 * copies auraient divergé au premier changement — et il y en a déjà eu un, l'arrivée du
 * personnel de l'organisme, qui n'a pas de fiche `learner`.
 *
 * DEUX SOURCES, dans cet ordre :
 *   · `learner` — le stagiaire. Avatar, cadre choisi, cadres exclusifs, formations terminées.
 *   · `user`    — le personnel de l'organisme (migration 126). Il n'a pas de fiche stagiaire,
 *                 et lui en fabriquer une polluerait les effectifs, Qualiopi et les exports.
 *
 * Chaque source est dans son propre try/catch : ces colonnes dépendent de migrations (070, 113,
 * 126) qui peuvent ne pas être jouées, et une liste d'auteurs sans avatar reste parfaitement
 * lisible — alors qu'une erreur 500 ferait disparaître le fil entier.
 *
 * Une seule requête par source pour toute la liste, jamais une par ligne.
 */

const noSchema = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');
const liste = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

/* Le cadre du personnel n'est adossé à aucune formation : il faut le déclarer « possédé »,
   sinon `cadrePorteDe` le rejette côté écran et l'école réapparaît sans cadre chez les AUTRES,
   alors qu'elle en porte un chez elle. */
const CADRE_PERSONNEL = 'ecole';

/**
 * Complète chaque ligne avec `author_avatar`, `author_done`, `author_cadre`, `author_cadres_ex`.
 * @param conn        connexion `db.promise()`
 * @param lignes      les lignes à compléter (modifiées sur place)
 * @param champId     nom du champ portant l'identifiant utilisateur (défaut `author_user_id`)
 * @param prefixe     préfixe des champs écrits (défaut `author_`). Les pastilles « qui a
 *                    commenté » les nomment sans préfixe (`avatar`, `cadre`…) : un second
 *                    fichier pour cette seule différence aurait redonné deux copies à tenir.
 */
async function enrichirAuteurs(conn, lignes, champId = 'author_user_id', prefixe = 'author_') {
    const AV = `${prefixe}avatar`, DONE = `${prefixe}done`;
    const CADRE = `${prefixe}cadre`, EX = `${prefixe}cadres_ex`;
    const uids = [...new Set((lignes || []).map((r) => r[champId]).filter(Boolean))];
    if (!uids.length) return lignes;

    try {
        const [ls] = await conn.query(
            'SELECT user_id, avatar, completed_levels, cadre, cadres_exclusifs FROM learner WHERE user_id IN (?)',
            [uids]);
        const par = Object.fromEntries(ls.map((x) => [x.user_id, x]));
        lignes.forEach((r) => {
            const l = par[r[champId]];
            r[AV] = (l && l.avatar) || null;
            r[DONE] = liste(l && l.completed_levels).length;
            r[CADRE] = (l && l.cadre) || null;
            r[EX] = liste(l && l.cadres_exclusifs);
        });
    } catch (e) { if (!noSchema(e)) throw e; }

    try {
        const [us] = await conn.query('SELECT id, avatar, cadre FROM user WHERE id IN (?)', [uids]);
        const par = Object.fromEntries(us.map((x) => [x.id, x]));
        lignes.forEach((r) => {
            const u = par[r[champId]];
            if (!u) return;
            if (!r[AV]) r[AV] = u.avatar || null;
            if (!r[CADRE]) r[CADRE] = u.cadre || null;
            if (u.cadre === CADRE_PERSONNEL) r[EX] = [...(r[EX] || []), CADRE_PERSONNEL];
        });
    } catch (e) { if (!noSchema(e)) throw e; } // migration 126 non jouée

    return lignes;
}

module.exports = { enrichirAuteurs, CADRE_PERSONNEL };
