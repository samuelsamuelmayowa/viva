import {chromium} from '@playwright/test'
import {readFile} from 'node:fs/promises'
const svg=await readFile(new URL('../public/viva.svg',import.meta.url),'utf8')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const size of [192,512]){const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}svg{width:100%;height:100%}</style>${svg}`);await page.screenshot({path:new URL(`../public/viva-${size}.png`,import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')});await page.close()}}finally{await browser.close()}
