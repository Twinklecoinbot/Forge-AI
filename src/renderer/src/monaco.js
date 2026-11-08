import { loader } from '@monaco-editor/react';

loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs'
  }
});

/** Forge Code theme — matches the rich dark syntax look (coral tags, cyan strings). */
export function defineForgeThemes(monaco) {
  monaco.editor.defineTheme('forge-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'D4D4D4' },
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'keyword.control', foreground: 'C586C0' },
      { token: 'storage', foreground: '569CD6' },
      { token: 'storage.type', foreground: '569CD6' },
      { token: 'string', foreground: '4FC1FF' },
      { token: 'string.html', foreground: 'B5CEA8' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'regexp', foreground: 'D16969' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'class', foreground: '4EC9B0' },
      { token: 'tag', foreground: 'F44747' },
      { token: 'tag.id', foreground: 'F44747' },
      { token: 'metatag', foreground: 'F44747' },
      { token: 'metatag.content.html', foreground: 'B5CEA8' },
      { token: 'metatag.html', foreground: 'F44747' },
      { token: 'attribute.name', foreground: 'D7BA7D' },
      { token: 'attribute.value', foreground: '4FC1FF' },
      { token: 'attribute.value.html', foreground: '4FC1FF' },
      { token: 'delimiter.html', foreground: '808080' },
      { token: 'delimiter.xml', foreground: '808080' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'variable.parameter', foreground: '9CDCFE' },
      { token: 'identifier', foreground: '9CDCFE' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'constant', foreground: '4FC1FF' },
      { token: 'operator', foreground: 'D4D4D4' },
      { token: 'delimiter', foreground: 'D4D4D4' }
    ],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#D4D4D4',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#C6C6C6',
      'editorCursor.foreground': '#AEAFAD',
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#3A3D41',
      'editorIndentGuide.background': '#404040',
      'editorIndentGuide.activeBackground': '#707070',
      'editor.lineHighlightBackground': '#2A2A2A'
    }
  });

  monaco.editor.defineTheme('forge-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'tag', foreground: 'A31515' },
      { token: 'attribute.name', foreground: 'FF0000' },
      { token: 'attribute.value', foreground: '0451A5' },
      { token: 'string', foreground: '0A7A0A' },
      { token: 'keyword', foreground: '0000FF' }
    ],
    colors: {
      'editor.background': '#FFFFFF'
    }
  });
}
