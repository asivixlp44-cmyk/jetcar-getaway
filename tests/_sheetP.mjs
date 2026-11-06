// portrait sheets: up to 6 tall shots side by side
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const dir = process.argv[2], out = process.argv[3], files = process.argv.slice(4);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files'] });
const p = await b.newPage(); await p.setViewport({ width: 1560, height: 844 });
const imgs = files.map((f) => `<div style="position:relative"><img src="${f}" style="width:390px;height:844px;display:block;object-fit:contain;background:#000"><span style="position:absolute;left:4px;bottom:4px;color:#ff0;font:bold 14px sans-serif;background:#000a">${f}</span></div>`).join('');
fs.writeFileSync(dir + '/_p.html', `<body style="margin:0;display:flex;background:#000">${imgs}</body>`);
await p.goto('file:///' + dir + '/_p.html'); await new Promise((r) => setTimeout(r, 400));
await p.screenshot({ path: out, type: 'jpeg', quality: 80 });
await b.close();
