/**
 * Contrôle de la règle d'interface de la console (`npm run test:console`), sans navigateur ni serveur :
 * tout bouton qui ouvre / ferme un panneau (À régler, Flotte, Affecter un chauffeur…) doit montrer
 * clairement son état et se refermer :
 *  - bouton `.tgl` : `aria-pressed`, `aria-controls` vers un panneau existant, icône `.tgl-ico` qui passe
 *    de « ouvrir » à ✕ (fermer) ;
 *  - panneau : `role="region"`, un titre (`aria-labelledby`) et un bouton « Fermer » (`data-close-panel`) ;
 *  - choix exclusifs (`.seg`) : `aria-pressed` sur chaque bouton ;
 *  - bouton « Affecter un chauffeur » (généré dans le script) : mêmes attributs, titre et « Fermer ».
 * Quand on ajoute un nouveau bouton de ce type, il suit la même règle ou ce contrôle échoue.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const html = fs.readFileSync(path.resolve(process.cwd(), 'public', 'console-operateur.html'), 'utf8').replace(/\r\n/g, '\n');
const markup = html.split('<script>')[0];
const script = html.slice(html.indexOf('<script>'));
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const tags = (re: RegExp, src = markup): string[] => [...src.matchAll(re)].map((m) => m[0]);

let passed = 0, failed = 0;
const test = (name: string, fn: () => void): void => {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.error(`❌ ${name}\n   ${(e as Error).message.split('\n').join('\n   ')}`); failed++; }
};

const toggles = tags(/<button\b[^>]*\bclass="[^"]*\btgl\b[^"]*"[^>]*>[\s\S]*?<\/button>/g);

test('boutons de panneau : il y en a (À régler, Flotte)', () => {
  assert.ok(toggles.length >= 2, `${toggles.length} bouton(s) .tgl trouvé(s)`);
  assert.ok(toggles.some((t) => /id="refundToggle"/.test(t)) && toggles.some((t) => /id="fleetToggle"/.test(t)));
});
test('boutons de panneau : aria-pressed (fermé au départ), aria-controls vers un panneau existant, icône et libellé', () => {
  const problems: string[] = [];
  for (const t of toggles) {
    const id = /\bid="([^"]+)"/.exec(t)?.[1] ?? '(sans id)';
    if (!/aria-pressed="false"/.test(t)) problems.push(`${id} : aria-pressed="false" manquant`);
    const ctl = /aria-controls="([^"]+)"/.exec(t)?.[1];
    if (!ctl || !ids.has(ctl)) problems.push(`${id} : aria-controls absent ou vers un id inconnu (${ctl})`);
    if (!/class="tgl-ico"[^>]*aria-hidden="true"/.test(t)) problems.push(`${id} : icône .tgl-ico (aria-hidden) manquante`);
    if (!/data-ico-closed="[^"]+"/.test(t) || !/data-label="[^"]+"/.test(t)) problems.push(`${id} : data-ico-closed / data-label manquants`);
    if (!/\btitle="Ouvrir le panneau/.test(t)) problems.push(`${id} : infobulle « Ouvrir le panneau… » manquante`);
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});
test('panneaux : région nommée, titre clair et bouton « Fermer »', () => {
  const problems: string[] = [];
  for (const t of toggles) {
    const ctl = /aria-controls="([^"]+)"/.exec(t)?.[1];
    if (!ctl) continue;
    const open = new RegExp(`<div[^>]*\\bid="${ctl}"[^>]*>`).exec(markup)?.[0] ?? '';
    if (!/role="region"/.test(open)) problems.push(`${ctl} : role="region" manquant`);
    const labelled = /aria-labelledby="([^"]+)"/.exec(open)?.[1];
    if (!labelled || !new RegExp(`<h3[^>]*\\bid="${labelled}"[^>]*>[^<]*(<span[^>]*>[^<]*</span>)?[^<]*\\S`).test(markup)) problems.push(`${ctl} : titre (h3) absent`);
    if (!new RegExp(`<button[^>]*data-close-panel="${ctl}"[^>]*>\\s*Fermer\\s*</button>`).test(markup)) problems.push(`${ctl} : bouton « Fermer » (data-close-panel) absent`);
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});
test('choix exclusifs (.seg) : aria-pressed sur chaque bouton', () => {
  const segs = tags(/<div class="seg"[^>]*>[\s\S]*?<\/div>/g);
  assert.ok(segs.length >= 2);
  const problems: string[] = [];
  for (const seg of segs) for (const b of tags(/<button\b[^>]*>/g, seg)) if (!/aria-pressed="(true|false)"/.test(b)) problems.push(b);
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});
test('script : setPanel() tient à jour aria-pressed, l\'icône ✕ et l\'infobulle ; « Fermer » rend le focus au bouton', () => {
  const fn = /function setPanel\([^)]*\)\{[\s\S]*?\n  \}/.exec(script)?.[0] ?? '';
  assert.ok(/aria-pressed/.test(fn) && /✕/.test(fn) && /btn\.title/.test(fn), 'setPanel incomplète');
  assert.ok(/data-close-panel/.test(script) && /\.focus\(\)/.test(/querySelectorAll\('\[data-close-panel\]'\)[\s\S]{0,300}/.exec(script)?.[0] ?? ''), 'focus non rendu au bouton');
  assert.ok(!/\$\('refundPanel'\)\.classList\.(toggle|add|remove)\(/.test(script) && !/\$\('fleetPanel'\)\.classList\.(toggle|add|remove)\(/.test(script), 'un panneau est ouvert / fermé sans passer par setPanel()');
});
test('script : le bouton « Affecter un chauffeur » suit la même règle (état, icône, titre « Fermer »)', () => {
  const tpl = /<div class="assign"><button class="assignbtn tgl[^"]*"[\s\S]*?<\/div><\/div>`/.exec(script)?.[0] ?? '';
  assert.ok(/aria-pressed="false"/.test(tpl) && /class="tgl-ico" aria-hidden="true"/.test(tpl), 'bouton sans aria-pressed ou icône');
  assert.ok(/class="assign-title"/.test(tpl) && /class="closebtn" type="button" data-action="toggle">Fermer</.test(tpl), 'panneau sans titre ou sans « Fermer »');
  const act = /if\(act==='toggle'\)\{[\s\S]*?return; \}/.exec(script)?.[0] ?? '';
  assert.ok(/aria-pressed/.test(act) && /✕/.test(act) && /\.focus\(\)/.test(act), 'gestionnaire « toggle » incomplet');
});

// ── Ergonomie : mise en page, cartes, finitions ──────────────────────────────────
const css = html.slice(0, html.indexOf('</style>'));
const fn = (name: string): string =>
  new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}`).exec(script)?.[0] ?? '';

test('mise en page : « Courses à venir » prend la place (colonne souple, page élargie sur grand écran)', () => {
  const wrap = /\.wrap \{[^}]*\}/.exec(css)?.[0] ?? '';
  const max = Number(/max-width:(\d+)px/.exec(wrap)?.[1] ?? 0);
  assert.ok(max >= 1600, `largeur maximale ${max}px`);
  assert.ok(/grid-template-columns:minmax\(\d+px,\d+px\) minmax\(0,1fr\)/.test(wrap), 'colonne du formulaire bornée, colonne des courses en 1fr');
});
test('en-tête de « Courses à venir » : titre et « Mis à jour » empilés, boutons qui passent à la ligne, jamais coupés', () => {
  assert.ok(/class="panel-head queue-head"><div class="qh-title"><h2 id="ttl-queue">[^<]*<\/h2><span class="updated" id="updated"/.test(markup), 'titre et « Mis à jour » dans .qh-title');
  assert.ok(/\.queue-head \{[^}]*flex-wrap:wrap/.test(css) && /\.queue-tools \{[^}]*flex-wrap:wrap[^}]*max-width:100%/.test(css) && /\.iconbtn \{[^}]*white-space:nowrap/.test(css), 'retours à la ligne manquants');
});
test('panneaux : ouvrir À régler ferme Flotte, et inversement (un seul ouvert à la fois)', () => {
  assert.ok(/if \(open\) for \(const other of Object\.keys\(PANEL_TOGGLES\)\) if \(other !== id .*\) setPanel\(other, false\)/.test(fn('setPanel')));
});
test('cartes : statut « À affecter » (et non « En attente »), actions en verbes', () => {
  assert.ok(/function statusLabel\(s\)\{ return \{PENDING:'À affecter'/.test(script), "PENDING doit s'afficher « À affecter »");
  assert.ok(!/PENDING:'En attente'/.test(script.slice(0, script.indexOf('const PAY_LABEL'))), '« En attente » comme statut de course');
  const sb = fn('statusButtons');
  for (const verb of ['Passer en route', 'Terminer la course', 'Changer de chauffeur…', 'Client absent…']) assert.ok(sb.includes(verb), `bouton « ${verb} » manquant`);
  assert.ok(!/>(En route|Terminée|Client absent|Annulée…)</.test(sb), 'ancien libellé sans verbe');
});
test('cartes : action principale mise en avant (go / primary) et Annuler la course… discret, en fin de carte', () => {
  const sb = fn('statusButtons');
  assert.ok(/class="stbtn go" data-action="st-EN_ROUTE"/.test(sb) && /s === 'ASSIGNED' \? '' : ' go'/.test(sb), 'action principale Passer en route / Terminer la course');
  assert.ok(/class="assignbtn tgl primary"/.test(script), "Affecter un chauffeur n'est pas l'action principale d'une course à affecter");
  assert.ok(!/st-CANCELLED/.test(sb), "l'annulation est encore parmi les actions courantes");
  assert.ok(/function cancelLink\(b\)[\s\S]*?class="cancel-link"[^>]*data-action="st-CANCELLED">Annuler la course…</.test(script), "lien d'annulation absent");
  assert.ok(/\$\{payBlock\(b\)\}<\/div>\s*\$\{cancelLink\(b\)\}\s*<\/div>/.test(script), "l'annulation doit être le dernier élément de la carte");
  assert.ok(/@container queue \(min-width: \d+px\)/.test(css) && /class="qmain"/.test(script) && /class="qside"/.test(script), 'carte sur deux colonnes sur grand écran');
  assert.ok(/\.cancel-link \{[^}]*font-size:11\.5px/.test(css), 'lien discret (petit)');
});
test('paiement : pas de « Payé via PayDunya » en double, pas de lien en entier, mais Copier le lien et WhatsApp', () => {
  assert.ok(!/Payé via PayDunya/.test(script), '« Payé via PayDunya » répété');
  assert.ok(!/class="payurl"|readonly value=/.test(script), 'le lien PayDunya est affiché en entier');
  const lb = fn('linkBlock');
  assert.ok(/data-action="copy" data-url=/.test(lb) && lb.includes('Copier le lien') && lb.includes('Envoyer par WhatsApp'), 'Copier le lien / WhatsApp');
});
test('« À régler » : explications petites et discrètes', () => {
  assert.ok(/\.rhelp \{[^}]*font-size:11\.5px/.test(css) && /class="rhelp">Courses non payées/.test(script) && /class="rhelp">Argent reçu/.test(script));
});
test("corridors : section repliée par défaut, « Non utilisés pour les réservations pour l'instant », flèche ↔", () => {
  const open = /<details[^>]*id="corridorSection"[^>]*>/.exec(markup)?.[0] ?? '';
  assert.ok(open && !/\bopen\b/.test(open), 'section absente ou ouverte par défaut');
  assert.ok(/Non utilisés pour les réservations pour l'instant/.test(markup), 'mention manquante');
  assert.ok(script.includes("replace(/\\s*<->\\s*/g, ' ↔ ')") && /routeLabel\(c\.label\)/.test(script), 'conversion de « <-> » en « ↔ » manquante');
});
test('fenêtre Tarifs : ✕ en haut à droite', () => {
  assert.ok(/<button class="xbtn"[^>]*id="tariffX"[^>]*aria-label="Fermer/.test(markup) && script.includes("$('tariffX').addEventListener('click', closeTariffs)"));
});
test('formulaire : « Motif du déplacement » sans valeur par défaut, choix obligatoire', () => {
  const sel = /<select id="purpose"[^>]*>[\s\S]*?<\/select>/.exec(markup)?.[0] ?? '';
  assert.ok(/<option value="" disabled selected>/.test(sel) && !/<option value="[A-Z]+" selected>/.test(sel), 'une valeur est présélectionnée');
  assert.ok(/<label for="purpose">[^<]*<span class="req">/.test(markup), 'astérisque manquant');
  assert.ok(script.includes("if(!$('purpose').value)") && script.includes("$('purpose').value=''"), "contrôle à l'envoi ou remise à vide manquants");
});

console.log(`\n${passed}/${passed + failed} contrôles réussis.`);
process.exit(failed === 0 ? 0 : 1);
