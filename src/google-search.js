// ============================================================
// google-search.js — Busca el sitio web oficial de una empresa en Google
// ============================================================

import { Actor } from 'apify';

/**
 * Busca en Google el sitio oficial de una empresa
 * Usa el actor de Google Search del Store de Apify
 *
 * @param {string} empresa - Nombre de la empresa
 * @param {string} pais - País de la empresa
 * @returns {string|null} URL del sitio oficial o null
 */
export async function findCompanyWebsite(empresa, pais) {
    const query = `"${empresa}" ${pais} sitio oficial`;

    try {
        // Llama al actor de Google Search de Apify
        const run = await Actor.call('apify/google-search-scraper', {
            queries: query,
            maxPagesPerQuery: 1,
            resultsPerPage: 5,
            languageCode: 'es',
            mobileResults: false,
        }, {
            memoryMbytes: 512,
            waitSecs: 60,
        });

        // Lee los resultados
        const { items } = await Actor.apifyClient
            .dataset(run.defaultDatasetId)
            .listItems({ limit: 5 });

        if (!items || items.length === 0) return null;

        // El primer item tiene los resultados orgánicos
        const results = items[0]?.organicResults || [];

        // Filtra resultados que NO son redes sociales, directorios genéricos, etc.
        const blocklist = [
            'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
            'youtube.com', 'tiktok.com', 'wikipedia.org', 'crunchbase.com',
            'glassdoor.com', 'indeed.com', 'bloomberg.com', 'reuters.com',
            'yellow.place', 'paginasamarillas', 'guialocal',
        ];

        for (const result of results) {
            const url = result.url || result.link || '';
            const domain = extractDomain(url);

            if (!domain) continue;

            const isBlocked = blocklist.some(b => domain.includes(b));
            if (!isBlocked) {
                // Normaliza a la home del dominio
                return `https://${domain}`;
            }
        }

        return null;
    } catch (error) {
        console.error(`Error buscando "${empresa}" en Google: ${error.message}`);
        return null;
    }
}

/**
 * Alternativa: búsqueda directa con HTTP (sin actor externo)
 * Más rápido y barato pero menos confiable (Google puede bloquear)
 *
 * @param {string} empresa
 * @param {string} pais
 * @param {object} proxyConfig
 * @returns {string|null}
 */
export async function findCompanyWebsiteDirect(empresa, pais, proxyConfig) {
    const { gotScraping } = await import('got-scraping');
    const cheerio = await import('cheerio');

    const query = encodeURIComponent(`"${empresa}" ${pais} sitio oficial`);
    const url = `https://www.google.com/search?q=${query}&hl=es&num=5`;

    try {
        const proxyUrl = proxyConfig?.useApifyProxy
            ? Actor.createProxyConfiguration(proxyConfig)?.newUrl()
            : undefined;

        const response = await gotScraping({
            url,
            proxyUrl,
            headerGeneratorOptions: {
                browsers: ['chrome'],
                locales: ['es-AR'],
            },
        });

        const $ = cheerio.load(response.body);
        const links = [];

        // Extrae links de resultados orgánicos
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const match = href.match(/\/url\?q=(https?:\/\/[^&]+)/);
            if (match) links.push(decodeURIComponent(match[1]));
        });

        const blocklist = [
            'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
            'youtube.com', 'tiktok.com', 'wikipedia.org', 'crunchbase.com',
            'google.com', 'glassdoor.com',
        ];

        for (const link of links) {
            const domain = extractDomain(link);
            if (!domain) continue;
            if (!blocklist.some(b => domain.includes(b))) {
                return `https://${domain}`;
            }
        }

        return null;
    } catch (error) {
        console.error(`Error en búsqueda directa "${empresa}": ${error.message}`);
        return null;
    }
}

function extractDomain(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}
