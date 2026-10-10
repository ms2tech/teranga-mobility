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
  const tpl = /<div class="assign"><button class="assignbtn tgl"[\s\S]*?<\/div><\/div>`/.exec(script)?.[0] ?? '';
  assert.ok(/aria-pressed="false"/.test(tpl) && /class="tgl-ico" aria-hidden="true"/.test(tpl), 'bouton sans aria-pressed ou icône');
  assert.ok(/class="assign-title"/.test(tpl) && /class="closebtn" type="button" data-action="toggle">Fermer</.test(tpl), 'panneau sans titre ou sans « Fermer »');
  const act = /if\(act==='toggle'\)\{[\s\S]*?return; \}/.exec(script)?.[0] ?? '';
  assert.ok(/aria-pressed/.test(act) && /✕/.test(act) && /\.focus\(\)/.test(act), 'gestionnaire « toggle » incomplet');
});

console.log(`\n${passed}/${passed + failed} contrôles réussis.`);
process.exit(failed === 0 ? 0 : 1);
