// Rendu HTML du contenu d'un document, fusionné avec les données du stagiaire,
// de l'entreprise et des formations couvertes (une ou plusieurs = un achat).
// Volontairement simple (aperçu lisible), pas un rendu .docx fidèle.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const frDate = (v) => {
    if (!v) return "";
    const [y, m, d] = String(v).slice(0, 10).split("-");
    return d && m && y ? `${d}/${m}/${y}` : String(v);
};
const euro = (n) => `${Number(n || 0).toLocaleString("fr-FR")} €`;
const today = () => frDate(new Date().toISOString());

function learnerName(l) {
    return [l.civility, l.first_name, l.last_name].filter(Boolean).join(" ");
}
function learnerAddress(l) {
    return [l.address, [l.zip_code, l.town].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function orgHeader(org) {
    return `<div class="doc-org">
        <b>${esc(org.legal_name)}</b><br>
        ${esc(org.address || "")} ${esc(org.zip_code || "")} ${esc(org.town || "")}<br>
        SIRET ${esc(org.siret || "—")} · NDA ${esc(org.nda || "—")} · NAF ${esc(org.naf_ape || "—")}<br>
        ${esc(org.phone || "")} · ${esc(org.email || "")}
    </div>`;
}

function clientBlock(l, company) {
    if (company && company.name) {
        return `<div class="doc-party"><span class="doc-lbl">Client (entreprise)</span>
            <b>${esc(company.name)}</b><br>
            ${esc(company.address || "")} ${esc(company.zip_code || "")} ${esc(company.town || "")}<br>
            SIRET ${esc(company.siret || "—")}<br>
            Représentant : ${esc([company.representative_civ, company.representative_name].filter(Boolean).join(" ") || "—")}<br>
            Stagiaire : ${esc(learnerName(l))}
        </div>`;
    }
    return `<div class="doc-party"><span class="doc-lbl">Stagiaire</span>
        <b>${esc(learnerName(l))}</b><br>
        ${esc(learnerAddress(l))}<br>
        ${esc(l.phone || "")} · ${esc(l.email || "")}
    </div>`;
}

function formationsTable(formations) {
    const rows = formations.map((f) => `<tr>
        <td>${esc(f.code)} — ${esc(f.title)}</td>
        <td>${f.start_date ? `du ${frDate(f.start_date)} au ${frDate(f.end_date)}` : `Sem. ${esc(f.week ?? "")}`}</td>
        <td>${esc(f.hours ?? "")} h</td>
        <td class="ta-r">${euro(f.price)}</td>
    </tr>`).join("");
    const total = formations.reduce((s, f) => s + Number(f.price || 0), 0);
    return `<table class="doc-table">
        <thead><tr><th>Formation</th><th>Dates</th><th>Durée</th><th class="ta-r">Prix</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3" class="ta-r"><b>Total</b></td><td class="ta-r"><b>${euro(total)}</b></td></tr></tfoot>
    </table>`;
}

function wrap(title, org, body) {
    return `<div class="doc-sheet">
        <div class="doc-head">
            ${orgHeader(org)}
            <div class="doc-title"><h2>${esc(title)}</h2><div class="doc-date">Le ${today()}</div></div>
        </div>
        ${body}
        <div class="doc-sign-row">
            <div class="doc-sign-box"><span>L'organisme</span></div>
            <div class="doc-sign-box"><span>Le stagiaire / l'entreprise</span></div>
        </div>
    </div>`;
}

/**
 * @param {string} type
 * @param {{org,learner,company,formations:Array}} ctx
 * @param {string} title
 */
function renderDocumentHTML(type, ctx, title) {
    const { org, learner: l, company, formations } = ctx;
    const t = title || type;

    switch (type) {
        case "DEVIS":
            return wrap(t, org, `
                <div class="doc-parties">${clientBlock(l, company)}</div>
                <p>Nous avons le plaisir de vous adresser notre devis pour la ou les formation(s) suivante(s) :</p>
                ${formationsTable(formations)}
                <p class="doc-note">Offre valable 30 jours. TVA non applicable, art. 261-4-4° du CGI.</p>`);

        case "CONTRAT":
        case "CONVENTION": {
            const isConv = type === "CONVENTION";
            return wrap(t, org, `
                <div class="doc-parties">
                    <div class="doc-party"><span class="doc-lbl">Entre</span>${orgHeader(org)}</div>
                    ${clientBlock(l, company)}
                </div>
                <p>${isConv
                    ? "La présente convention de formation professionnelle est conclue en application des articles L.6353-1 et suivants du Code du travail."
                    : "Le présent contrat de formation professionnelle est conclu en application des articles L.6353-3 et suivants du Code du travail."}</p>
                <h4>Objet de la formation</h4>
                ${formationsTable(formations)}
                <p>Le stagiaire s'engage à suivre la ou les formation(s) ci-dessus aux dates indiquées.</p>`);
        }

        case "DROIT_IMAGE":
            return wrap(t, org, `
                <div class="doc-parties">${clientBlock(l, company)}</div>
                <p>Je soussigné(e) <b>${esc(learnerName(l))}</b> autorise ${esc(org.legal_name)} à
                utiliser mon image (photographies, vidéos) réalisée dans le cadre de la formation, à des fins
                pédagogiques et de communication, sans contrepartie financière.</p>
                <p class="doc-note">Conformément au RGPD, ce consentement peut être retiré à tout moment.</p>`);

        case "CONVOCATION":
        case "INVITATION": {
            const f = formations[0] || {};
            return wrap(t, org, `
                <div class="doc-parties">${clientBlock(l, company)}</div>
                <p>${type === "CONVOCATION"
                    ? "Vous êtes convoqué(e) à l'examen de la formation suivante :"
                    : "Vous êtes invité(e) à la formation suivante :"}</p>
                ${formationsTable(formations)}
                <p>Merci de vous présenter le <b>${esc(frDate(f.start_date))}</b> muni(e) d'une pièce d'identité.</p>`);
        }

        case "CERTIFICAT_REALISATION": {
            const f = formations[0] || {};
            const totalH = formations.reduce((s, x) => s + Number(x.hours || 0), 0);
            return wrap(t, org, `
                <p>${esc(org.legal_name)} certifie que <b>${esc(learnerName(l))}</b> a suivi la ou les
                formation(s) :</p>
                ${formationsTable(formations)}
                <p>Durée totale réalisée : <b>${totalH} heures</b>${f.end_date ? `, achevée le <b>${esc(frDate(f.end_date))}</b>` : ""}.</p>`);
        }

        default:
            return wrap(t, org, `
                <div class="doc-parties">${clientBlock(l, company)}</div>
                ${formations.length ? formationsTable(formations) : ""}
                <p class="doc-note">Document : ${esc(t)}.</p>`);
    }
}

module.exports = { renderDocumentHTML };
