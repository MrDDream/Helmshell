// Éditeur de code : CodeMirror 5 (coloration, recherche/remplacement, numéros de ligne).
import { CDN, loadScript, loadStyle } from './load.js';
import { LANG } from './i18n.js';

const CM = `${CDN}codemirror@5.65.21/`;
// Textes de CodeMirror (en anglais d'origine) : traduits seulement quand l'interface est en français
const PHRASES = {
  'Search:': 'Rechercher :', 'With:': 'Remplacer par :', 'Replace:': 'Remplacer :', 'Replace all:': 'Tout remplacer :',
  'Replace?': 'Remplacer ?', Yes: 'Oui', No: 'Non', All: 'Tout', Stop: 'Arrêter',
  '(Use /re/ syntax for regexp search)': '(/expr/ pour une expression régulière)',
  'Jump to line:': 'Aller à la ligne :', '(Use line:column or scroll% syntax)': '(ligne:colonne)',
};
let ready = null;

export function editorReady() {
  if (!ready) {
    ready = (async () => {
      loadStyle(`${CM}lib/codemirror.css`);
      loadStyle(`${CM}addon/dialog/dialog.css`);
      await loadScript(`${CM}lib/codemirror.js`);
      // Ces extensions ne dépendent que de CodeMirror : chargement en parallèle.
      await Promise.all(['mode/meta.js', 'addon/mode/loadmode.js', 'addon/search/searchcursor.js', 'addon/dialog/dialog.js',
        'addon/edit/matchbrackets.js', 'addon/edit/closebrackets.js', 'addon/selection/active-line.js', 'addon/comment/comment.js',
        'addon/mode/simple.js', 'addon/mode/overlay.js', 'addon/mode/multiplex.js']
        .map((f) => loadScript(CM + f)));
      await Promise.all(['addon/search/search.js', 'addon/search/jump-to-line.js'].map((f) => loadScript(CM + f)));
      window.CodeMirror.modeURL = `${CM}mode/%N/%N.js`;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/**
 * Crée un éditeur dans `box`.
 * options : value, path (pour la coloration), readOnly, line (ligne à surligner), onSave, onChange
 */
export async function createEditor(box, { value = '', path = '', readOnly = false, line = 0, onSave, onChange } = {}) {
  await editorReady();
  const CodeMirror = window.CodeMirror;
  box.innerHTML = '';
  const save = () => { if (onSave) onSave(); };
  const cm = CodeMirror(box, {
    value,
    readOnly,
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    matchBrackets: true,
    autoCloseBrackets: !readOnly,
    styleActiveLine: !readOnly,
    viewportMargin: 30,
    phrases: LANG === 'fr' ? PHRASES : null,
    extraKeys: {
      'Ctrl-S': save,
      'Cmd-S': save,
      'Ctrl-F': 'findPersistent',
      'Cmd-F': 'findPersistent',
      'Ctrl-H': 'replace',
      'Ctrl-G': 'jumpToLine',
      'Ctrl-/': 'toggleComment',
      'Cmd-/': 'toggleComment',
      Tab: (c) => (c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection(' '.repeat(c.getOption('indentUnit')), 'end')),
      'Shift-Tab': (c) => c.indentSelection('subtract'),
    },
  });
  const name = path.split('/').pop() || '';
  const info = CodeMirror.findModeByFileName(name) || (/^\.env/.test(name) ? CodeMirror.findModeByName('Properties files') : null);
  if (info && info.mode && info.mode !== 'null') {
    cm.setOption('mode', info.mime || info.mode);
    CodeMirror.autoLoadMode(cm, info.mode);
  }
  if (line > 0) goToLine(cm, line);
  if (onChange) cm.on('change', onChange);
  return cm;
}

export function goToLine(cm, line) {
  const l = Math.max(0, Math.min(line - 1, cm.lineCount() - 1));
  cm.setCursor({ line: l, ch: 0 });
  cm.addLineClass(l, 'background', 'cm-hit');
  requestAnimationFrame(() => cm.scrollIntoView({ line: l, ch: 0 }, cm.getScrollInfo().clientHeight / 3));
}
