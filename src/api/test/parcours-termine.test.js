/**
 * UN PARCOURS FINI DOIT LE DIRE — signalé par l'école le 2026-09-23.
 *
 * CE QUI A ÉTÉ VU EN PRODUCTION, sur un dossier NIV1H complet : la carte « Parcours » affichait
 * « 100 % · 16 validées · 0 à faire », et quinze pixels plus bas « Étape 1 sur 16 ». Deux
 * énoncés contradictoires sur le même écran, et le second gagnait à la lecture — on croyait le
 * dossier au début alors qu'il ne restait rien à faire.
 *
 * LA CAUSE : le panneau de détail ouvre la « prochaine étape ». Quand il n'y en a plus (tout est
 * fait), le repli tombait sur la PREMIÈRE — l'étape 1. Le rang affiché est celui de l'étape
 * OUVERTE, pas un avancement, mais rien ne le disait.
 *
 * ET LA VRAIE QUESTION DERRIÈRE : la fiche annonçait aussi « 1 formation · 0 terminée ». Le
 * parcours documentaire est CALCULÉ ; la formation terminée est DÉCLARÉE
 * (`learner.completed_levels`), et sa case vit dans un repli de la fenêtre de modification que
 * personne n'ouvre pour ça. L'école a tranché : on PROPOSE de la cocher, on ne la coche pas —
 * une session peut s'achever sans que la formation soit acquise.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('un parcours terminé n\'ouvre plus sur l\'étape 1', () => {
    const src = sansCommentaires(lire('components/EnrollmentParcours.jsx'));
    /* Le repli va à la DERNIÈRE étape, pas à la première : sans prochaine étape, c'est le dernier
       geste fait qui intéresse, jamais le premier. */
    assert.match(src, /const derniere = r\.data\.steps\[r\.data\.steps\.length - 1\]\?\.key \|\| null;/);
    assert.match(src, /setSel\(\(cur\) => cur \|\| r\.data\.currentKey \|\| derniere\);/);
    assert.ok(!/setSel\(\(cur\) => cur \|\| r\.data\.currentKey \|\| r\.data\.steps\[0\]/.test(src),
        'l’ancien repli sur l’étape 1 ne doit plus exister');

    /* ET LE RANG SE DIT POUR CE QU'IL EST : « parcours terminé » quand il n'y a plus de prochaine
       étape, sans quoi un rang seul se lit comme un avancement. */
    assert.match(src, /!data\.currentKey \? " · parcours terminé"/);
    assert.match(src, /step\.key === data\.currentKey \? " · prochaine étape" : ""/);
});

test('la fiche PROPOSE de marquer la formation terminée, elle ne la coche pas', () => {
    const src = sansCommentaires(lire('pages/StagiaireDetail.jsx'));
    /* DEUX CONDITIONS OBJECTIVES, et un clic. La session doit être passée ET la formation ne pas
       être déjà marquée : proposer sur une session en cours ferait cocher « terminée » à
       mi-parcours, et le compteur du stagiaire s'en sert. */
    assert.match(src, /const sessionPassee = !!\(curEnr\?\.end_date && curEnr\.end_date < new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\);/);
    assert.match(src, /const aMarquer = !!\(curEnr\?\.program_code && sessionPassee && !terminees\.includes\(curEnr\.program_code\)\);/);
    assert.match(src, /Marquer comme terminée/);
    /* LE GESTE AJOUTE, il ne remplace pas : une formation déjà acquise ne doit pas disparaître
       parce qu'on en termine une autre. */
    assert.match(src, /completed_levels: \[\.\.\.terminees, curEnr\.program_code\]\.join\(","\)/);
    /* RIEN N'EST ÉCRIT SANS CLIC : le bandeau ne s'affiche que dans un rendu, et l'appel vit
       dans une fonction déclenchée par le bouton. */
    assert.match(src, /onClick=\{marquerTerminee\}/);
    assert.ok(!/useEffect\([^)]*marquerTerminee/.test(src), 'aucun effet ne doit cocher tout seul');

    /* LE BANDEAU N'APPARAÎT QUE SUR UN PARCOURS FINI : c'est le composant qui le décide, avec la
       même condition que le libellé — pas de règle recopiée. */
    const parc = sansCommentaires(lire('components/EnrollmentParcours.jsx'));
    assert.match(parc, /\{!data\.currentKey && renderFin\?\.\(\)\}/);
    assert.match(src, /renderFin=\{bandeauFinFormation\}/);
    /* Et il se voit sans se confondre avec une réussite : ton neutre, pas vert. */
    assert.match(lire('styles/app.css'), /\.parc-fin\{display:flex/);
});
