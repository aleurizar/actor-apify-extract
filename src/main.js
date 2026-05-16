// ============================================================
// main.js — Actor principal: Contact Scraper LATAM
// v2: Mejores headers, manejo de bloqueos, status más preciso
// ============================================================

import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { parseCompanyCSV } from './csv-parser.js';
import { findCompanyWebsite } from './google-search.js';
import {
    extractSocials,
    extractPhones,
    extractEmails,
    extractAddress,
    findRelevantPages,
} from './extractors.js';

await Actor.init();

// ─── INPUT ──────────────────────────────────────────────
const input = await Actor.getInput();
const { csvUrl, csvFile, maxPagesPerSite = 5, proxyConfig } = input;

// ─── 1. PARSEAR CSV ─────────────────────────────────────
let csvContent = '';

if (csvUrl) {
    console.log(`Descargando CSV desde: ${csvUrl}`);
    const response = await fetch(csvUrl);
    csvContent = await response.text();
} else if (csvFile) {
    csvContent = csvFile;
} else {
    throw new Error('Necesitás proporcionar csvUrl o csvFile en el input.');
}

const companies = parseCompanyCSV(csvContent);
console.log(`Empresas a procesar: ${companies.length}`);

// ─── 2. BUSCAR SITIOS WEB ──────────────────────────────
console.log('Buscando sitios web en Google...');

const companyData = new Map();

for (const { empresa, pais } of companies) {
    console.log(`  Buscando: "${empresa}" (${pais})...`);

    const website = await findCompanyWebsite(empresa, pais);

    if (website) {
        console.log(`  ✓ Encontrado: ${website}`);
        companyData.set(website, {
            empresa,
            pais,
            website,
            socials: {},
            phones: [],
            emails: [],
            address: null,
            pagesScraped: [],
            blocked: false,
        });
    } else {
        console.log(`  ✗ No se encontró sitio para "${empresa}"`);
        await Dataset.pushData({
            empresa,
            pais,
            website: null,
            linkedin: null,
            facebook: null,
            instagram: null,
            twitter: null,
            youtube: null,
            tiktok: null,
            phones: [],
            emails: [],
            address: null,
            status: 'WEBSITE_NOT_FOUND',
            pagesScraped: [],
        });
    }

    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
}

// ─── 3. CRAWLEAR SITIOS ────────────────────────────────
console.log(`\nCrawleando ${companyData.size} sitios web...`);

const startRequests = [...companyData.entries()].map(([url, data]) => ({
    url,
    userData: {
        empresa: data.empresa,
        pais: data.pais,
        baseUrl: url,
        depth: 0,
    },
}));

const proxyConfiguration = proxyConfig?.useApifyProxy
    ? await Actor.createProxyConfiguration(proxyConfig)
    : undefined;

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxConcurrency: 3,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 30,
    ignoreSslErrors: true,

    preNavigationHooks: [
        (crawlingContext) => {
            const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
            crawlingContext.request.headers = {
                'User-Agent': ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0',
            };
        },
    ],

    async requestHandler({ request, $, enqueueLinks }) {
        const { empresa, pais, baseUrl, depth } = request.userData;
        const data = companyData.get(baseUrl);

        if (!data) return;

        console.log(`  Scrapeando: ${request.url} (${empresa})`);
        data.pagesScraped.push(request.url);

        const socials = extractSocials($);
        const phones = extractPhones($);
        const emails = extractEmails($);
        const address = extractAddress($);

        for (const [key, value] of Object.entries(socials)) {
            if (!data.socials[key]) data.socials[key] = value;
        }
        data.phones = [...new Set([...data.phones, ...phones])];
        data.emails = [...new Set([...data.emails, ...emails])];
        if (!data.address && address) data.address = address;

        console.log(`    Datos encontrados: ${Object.keys(socials).length} redes, ${phones.length} tel, ${emails.length} email${address ? ', dirección ✓' : ''}`);

        if (depth === 0) {
            const relevantPages = findRelevantPages($, baseUrl);
            const pagesToVisit = relevantPages.slice(0, maxPagesPerSite - 1);

            if (pagesToVisit.length > 0) {
                console.log(`    → Encontradas ${pagesToVisit.length} páginas internas: ${pagesToVisit.join(', ')}`);
                for (const pageUrl of pagesToVisit) {
                    await crawler.addRequests([{
                        url: pageUrl,
                        userData: {
                            empresa,
                            pais,
                            baseUrl,
                            depth: 1,
                        },
                    }]);
                }
            }
        }
    },

    async failedRequestHandler({ request }) {
        const { empresa, baseUrl } = request.userData;
        const data = companyData.get(baseUrl);
        if (data) data.blocked = true;
        console.warn(`  ✗ Falló: ${request.url} (${empresa})`);
    },
});

await crawler.run(startRequests);

// ─── 4. GUARDAR RESULTADOS ─────────────────────────────
console.log('\nGuardando resultados...');

let okCount = 0;
let partialCount = 0;
let blockedCount = 0;

for (const [, data] of companyData) {
    let status = 'OK';
    const hasData = Object.keys(data.socials).length > 0 || data.phones.length > 0 || data.emails.length > 0;

    if (data.blocked && !hasData) {
        status = 'BLOCKED';
        blockedCount++;
    } else if (data.blocked && hasData) {
        status = 'PARTIAL';
        partialCount++;
    } else {
        okCount++;
    }

    await Dataset.pushData({
        empresa: data.empresa,
        pais: data.pais,
        website: data.website,
        linkedin: data.socials.linkedin || null,
        facebook: data.socials.facebook || null,
        instagram: data.socials.instagram || null,
        twitter: data.socials.twitter || null,
        youtube: data.socials.youtube || null,
        tiktok: data.socials.tiktok || null,
        phones: data.phones.slice(0, 3),
        emails: data.emails.slice(0, 3),
        address: data.address,
        status,
        pagesScraped: data.pagesScraped,
    });
}

console.log(`\n✓ Listo! ${companyData.size} empresas procesadas.`);
console.log(`  OK: ${okCount} | Parcial: ${partialCount} | Bloqueado: ${blockedCount}`);
await Actor.exit();
