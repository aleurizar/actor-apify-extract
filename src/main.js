// ============================================================
// main.js — Actor principal: Contact Scraper LATAM
//
// Pipeline:
// 1. Lee CSV con empresa + país
// 2. Busca sitio web en Google
// 3. Crawlea páginas de contacto/about
// 4. Extrae: redes sociales, teléfono, email, dirección
// 5. Guarda en dataset de Apify (exportable a CSV/JSON)
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

const companyData = new Map(); // empresa -> { pais, website, contactData }

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
        });
    } else {
        console.log(`  ✗ No se encontró sitio para "${empresa}"`);
        // Guarda igualmente con datos vacíos
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

    // Pausa entre búsquedas para no saturar
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
}

// ─── 3. CRAWLEAR SITIOS ────────────────────────────────
console.log(`\nCrawleando ${companyData.size} sitios web...`);

// Prepara requests iniciales (homepage de cada empresa)
const startRequests = [...companyData.entries()].map(([url, data]) => ({
    url,
    userData: {
        empresa: data.empresa,
        pais: data.pais,
        baseUrl: url,
        depth: 0,
    },
}));

// Configura proxy
const proxyConfiguration = proxyConfig?.useApifyProxy
    ? await Actor.createProxyConfiguration(proxyConfig)
    : undefined;

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxConcurrency: 3,
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 30,

    async requestHandler({ request, $, enqueueLinks }) {
        const { empresa, pais, baseUrl, depth } = request.userData;
        const data = companyData.get(baseUrl);

        if (!data) return;

        console.log(`  Scrapeando: ${request.url} (${empresa})`);
        data.pagesScraped.push(request.url);

        // ── Extraer datos de esta página ──
        const socials = extractSocials($);
        const phones = extractPhones($);
        const emails = extractEmails($);
        const address = extractAddress($);

        // Merge con datos existentes (acumula de todas las páginas)
        Object.assign(data.socials, { ...socials, ...data.socials });
        data.phones = [...new Set([...data.phones, ...phones])];
        data.emails = [...new Set([...data.emails, ...emails])];
        if (!data.address && address) data.address = address;

        // ── Descubrir páginas internas relevantes (solo desde la home) ──
        if (depth === 0) {
            const relevantPages = findRelevantPages($, baseUrl);
            const pagesToVisit = relevantPages.slice(0, maxPagesPerSite - 1);

            if (pagesToVisit.length > 0) {
                console.log(`    → Encontradas ${pagesToVisit.length} páginas internas`);
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
        console.warn(`  ✗ Falló: ${request.url} (${empresa})`);
    },
});

await crawler.run(startRequests);

// ─── 4. GUARDAR RESULTADOS ─────────────────────────────
console.log('\nGuardando resultados...');

for (const [, data] of companyData) {
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
        status: 'OK',
        pagesScraped: data.pagesScraped,
    });
}

console.log(`\n✓ Listo! ${companyData.size} empresas procesadas.`);
await Actor.exit();
