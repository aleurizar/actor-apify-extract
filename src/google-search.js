// ============================================================
// google-search.js — Busca el sitio web oficial de una empresa en Google
// ============================================================

import { Actor } from 'apify';

/**
 * Busca en Google el sitio oficial de una empresa
 * Usa el actor de Google Search del Store de Apify
 */
export async function findCompanyWebsite(empresa, pais) {
    const query = `"${empresa}" ${pais} sitio oficial`;

    try {
        const run = await Actor.call('apify/google-search-scraper', {
            queries: query,
            maxPagesPerQuery: 1,
            resultsPerPage: 5,
            languageCode: 'es',
            mobileResults: false,
        });

        const { items } = await Actor.apifyClient
            .dataset(run.defaultDatasetId)
            .listItems({ limit: 5 });

        if (!items || items.length === 0) return null;

        const results = items[0]?.organicResults || [];

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
                return `https://${domain}`;
            }
        }

        return null;
    } catch (error) {
        console.error(`Error buscando "${empresa}" en Google: ${error.message}`);
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
