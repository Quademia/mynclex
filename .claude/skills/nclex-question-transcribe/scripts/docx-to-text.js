// Minimal OOXML → readable text converter for content extraction.
// Walks document.xml: paragraphs → lines, tables → pipe-delimited rows.
// Preserves bold/highlight/shading hints as inline markers so the NGN
// specimen's answer-key formatting (bold correct answers, shaded cells)
// survives extraction.
const fs = require('fs');

const xml = fs.readFileSync(process.argv[2], 'utf8');

// --- tiny tag-stream walker (no deps) ---
let out = [];

function textOfRuns(chunk) {
  // Concatenate runs; mark bold runs with ** and highlighted runs with ==.
  let s = '';
  const runRe = /<w:r\b[\s\S]*?<\/w:r>/g;
  let m;
  while ((m = runRe.exec(chunk))) {
    const run = m[0];
    const props = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    const bold = /<w:b\b(?![a-zA-Z])(?:[^>]*)\/>/.test(props) && !/<w:b\b[^>]*w:val="(?:0|false)"/.test(props);
    const highlight = /<w:highlight\b/.test(props) || /<w:shd\b[^>]*w:fill="(?!auto|FFFFFF)/i.test(props);
    let t = '';
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let tm;
    while ((tm = tRe.exec(run))) t += tm[1];
    if (/<w:tab\/>/.test(run)) t = '\t' + t;
    if (/<w:br\/>/.test(run)) t = ' / ' + t;
    if (!t) continue;
    if (bold && highlight) s += `**==${t}==**`;
    else if (bold) s += `**${t}**`;
    else if (highlight) s += `==${t}==`;
    else s += t;
  }
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#8217;|&#x2019;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"').replace(/&quot;/g, '"');
}

function walk(body, depth) {
  // Split top-level children: tables vs paragraphs, in document order.
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(body))) {
    const chunk = m[0];
    if (chunk.startsWith('<w:tbl>')) {
      out.push('');
      const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
      let r;
      while ((r = rowRe.exec(chunk))) {
        const cells = [];
        const cellRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
        let c;
        while ((c = cellRe.exec(r[0]))) {
          const cell = c[0];
          const shaded = /<w:tcPr>[\s\S]*?<w:shd\b[^>]*w:fill="(?!auto|FFFFFF)/i.test(cell);
          const span = (cell.match(/<w:gridSpan w:val="(\d+)"\/>/) || [])[1];
          const vmerge = /<w:vMerge\/>/.test(cell) ? 'vMERGED' : (/<w:vMerge w:val="restart"\/>/.test(cell) ? 'vSTART:' : '');
          // paragraphs inside the cell
          const paras = [];
          const pRe = /<w:p\b[\s\S]*?<\/w:p>/g;
          let p;
          while ((p = pRe.exec(cell))) {
            const t = textOfRuns(p[0]);
            if (t.trim()) paras.push(t.trim());
          }
          let label = paras.join(' / ');
          if (shaded) label = `[shaded]${label}`;
          if (span) label = `[span${span}]${label}`;
          if (vmerge) label = `[${vmerge}]${label}`;
          cells.push(label);
        }
        out.push('| ' + cells.join(' | ') + ' |');
      }
      out.push('');
    } else {
      const style = (chunk.match(/<w:pStyle w:val="([^"]+)"\/>/) || [])[1] || '';
      const numbered = /<w:numPr>/.test(chunk);
      const t = textOfRuns(chunk);
      if (!t.trim()) { out.push(''); continue; }
      let prefix = '';
      if (/^Heading/i.test(style)) prefix = '#'.repeat(Math.min(+(style.replace(/\D/g, '') || 1), 6)) + ' ';
      else if (numbered) prefix = '- ';
      out.push(prefix + t.trim());
    }
  }
}

const body = (xml.match(/<w:body>[\s\S]*<\/w:body>/) || [xml])[0];
walk(body, 0);

// Collapse runs of blank lines
const text = out.join('\n').replace(/\n{3,}/g, '\n\n');
fs.writeFileSync(process.argv[3], text, 'utf8');
console.log('lines:', text.split('\n').length, 'chars:', text.length);
