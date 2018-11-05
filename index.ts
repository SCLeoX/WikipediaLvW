import { JSDOM } from 'jsdom';
import { get } from 'request-promise-native';
import { existsSync, readFileSync, writeFileSync, appendFile, ensureDirSync } from 'fs-extra';

ensureDirSync('./data');

let queue: Array<string>;
let queueSet: Set<string>;
if (existsSync('./data/queue.txt')) {
  const content = readFileSync('./data/queue.txt').toString();
  queue = content.split('\n');
  queueSet = new Set(queue);
  console.info(`${queue.length} items loaded from queue.txt.`);
} else {
  writeFileSync('./data/queue.txt', 'science\n');
  queue = ['science'];
  queueSet = new Set(queue);
  console.info('New session started.');
}

let finished = 0;
if (existsSync('./data/finished.txt')) {
  const content = readFileSync('./data/finished.txt').toString();
  finished = +content;
}

if (!existsSync('./data/data.csv')) {
  writeFileSync('./data/data.csv', '');
}

let inProgress = 0;
const baseUrl = 'https://en.wikipedia.org/wiki/';
const maxParallel = 10;

const countWords = function(str: string) {
  let expectingWhitespace = false;
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    const isWhitespace = ' \t'.includes(str[i]);
    if (expectingWhitespace === isWhitespace) {
      expectingWhitespace = !expectingWhitespace;
      if (expectingWhitespace === true) {
        count++;
      }
    }
  }
  return count;
}

async function go() {
  const amount = Math.min(maxParallel, queue.length - finished) - inProgress;
  for (let i = 0; i < amount; i++) {
    start();
  }
}

async function start() {
  inProgress++;
  const subject = queue[finished + inProgress - 1];
  const url = baseUrl + subject;
  console.info(`[${subject}] Downloading ${url}.`);
  const data = await get(url);
  const dom = new JSDOM(data);
  const content = dom.window.document.getElementById('content')!;
  const words = countWords(content.textContent!);
  const languages = dom.window.document.getElementsByClassName('interlanguage-link').length;
  console.info(`[${subject}] Counted ${words} words and ${languages} languages. Recording...`);
  await appendFile('./data/data.csv', `${subject},${words},${languages}\n`);
  console.info(`[${subject}] Collecting links...`);
  const links = content.getElementsByTagName('a');
  let nonInternal = 0;
  let queued = 0;
  let collected = 0;
  const newSubjects = [];
  for (let link of links) {
    const href = link.href;
    if (!link.href.startsWith('/wiki/') || href.includes(':') || href.includes('#')) {
      nonInternal++;
      continue;
    }
    const newSubject = href.substr(6);
    if (queueSet.has(newSubject)) {
      queued++;
      continue;
    }
    queueSet.add(newSubject);
    queue.push(newSubject);
    newSubjects.push(newSubject);
    collected++;
  }
  newSubjects.push('');
  await appendFile('./data/queue.txt', newSubjects.join('\n'));
  console.info(`[${subject}] ${nonInternal} non-internal, ${queued} queued before, ${collected} collected.`);
  inProgress--;
  finished++;
  writeFileSync('./data/finished.txt', String(finished));
  go();
}

go();