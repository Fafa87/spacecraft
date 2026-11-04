import { defaultContent } from '@sms/shared';
import { rulesHtml } from './rulesPage.js';
import './rules.css';

const root = document.getElementById('rules')!;
root.innerHTML = rulesHtml(defaultContent);
// #kompendium in the URL opens the compendium right away.
if (location.hash === '#kompendium') root.querySelector('details')?.setAttribute('open', '');
