// ============================================================
// extractors.js — Funciones para extraer datos de contacto del HTML
// ============================================================

/**
 * Patrones de redes sociales — detecta URLs en href y texto
 */
const SOCIAL_PATTERNS = {
    linkedin: /https?:\/\/(www\.)?linkedin\.com\/(company|in|school)\/[a-zA-Z0-9_-]+\/?/gi,
    facebook: /https?:\/\/(www\.)?(facebook|fb)\.com\/[a-zA-Z0-9._-]+\/?/gi,
    instagram: /https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+\/?/gi,
    twitter: /https?:\/\/(www\.)?(twitter|x)\.com\/[a-zA-Z0-9_]+\/?/gi,
    youtube: /https?:\/\/(www\.)?youtube\.com\/(channel|c|user|@)[a-zA-Z0-9_-]+\/?/gi,
    tiktok: /https?:\/\/(www\.)?tiktok\.com\/@[a-zA-Z0-9._-]+\/?/gi,
};

/**
 * Patrones de teléfono — formatos comunes en LATAM
 * Cubre: +54 11 1234-5678, (011) 4567-8901, +55 11 99999-9999, etc.
 */
const PHONE_PATTERNS = [
    /\+?\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
    /\(\d{2,4}\)\s?\d{4}[\s.-]?\d{4}/g,
];

/**
 * Patrón de email
 */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Extrae redes sociales del HTML
 */
export function extractSocials($) {
    const socials = {};
    const allHtml = $.html();

    for (const [network, pattern] of Object.entries(SOCIAL_PATTERNS)) {
        const matches = allHtml.match(pattern);
        if (matches) {
            // Deduplica y limpia
            const unique = [...new Set(matches.map(u => u.replace(/\/$/, '').toLowerCase()))];
            // Filtra URLs genéricas (share buttons, etc.)
            const filtered = unique.filter(u =>
                !u.includes('/sharer') &&
                !u.includes('/share') &&
                !u.includes('/intent/') &&
                !u.includes('/hashtag/') &&
                !u.includes('/home') &&
                !u.includes('/login')
            );
            if (filtered.length > 0) {
                socials[network] = filtered[0]; // Toma la primera (más probable que sea la oficial)
            }
        }
    }

    // También busca en atributos href de links
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        for (const [network, pattern] of Object.entries(SOCIAL_PATTERNS)) {
            if (!socials[network] && pattern.test(href)) {
                const clean = href.replace(/\/$/, '').toLowerCase();
                if (!clean.includes('/sharer') && !clean.includes('/share')) {
                    socials[network] = clean;
                }
            }
            // Reset regex lastIndex
            pattern.lastIndex = 0;
        }
    });

    return socials;
}

/**
 * Extrae teléfonos del HTML
 */
export function extractPhones($) {
    const phones = new Set();

    // Busca en links tel:
    $('a[href^="tel:"]').each((_, el) => {
        const tel = $(el).attr('href').replace('tel:', '').trim();
        if (tel.length >= 8) phones.add(tel);
    });

    // Busca en texto visible de secciones relevantes
    const textContent = $('body').text();
    for (const pattern of PHONE_PATTERNS) {
        const matches = textContent.match(pattern);
        if (matches) {
            matches.forEach(m => {
                const cleaned = m.trim();
                // Filtra números que parecen años, códigos postales, etc.
                if (cleaned.length >= 8 && cleaned.length <= 20) {
                    phones.add(cleaned);
                }
            });
        }
    }

    return [...phones].slice(0, 5); // Máximo 5 teléfonos
}

/**
 * Extrae emails del HTML
 */
export function extractEmails($) {
    const emails = new Set();

    // Links mailto:
    $('a[href^="mailto:"]').each((_, el) => {
        const email = $(el).attr('href').replace('mailto:', '').split('?')[0].trim().toLowerCase();
        if (email && !email.includes('example.com') && !email.includes('sentry.io')) {
            emails.add(email);
        }
    });

    // Regex en texto
    const textContent = $('body').text();
    const matches = textContent.match(EMAIL_PATTERN);
    if (matches) {
        matches.forEach(e => {
            const email = e.toLowerCase();
            // Filtra emails de tracking, imágenes, etc.
            if (
                !email.includes('example.com') &&
                !email.includes('sentry') &&
                !email.includes('wixpress') &&
                !email.includes('.png') &&
                !email.includes('.jpg') &&
                !email.endsWith('.webp')
            ) {
                emails.add(email);
            }
        });
    }

    return [...emails].slice(0, 5);
}

/**
 * Extrae dirección física del HTML
 * Busca en schema.org, meta tags, y texto común
 */
export function extractAddress($) {
    // 1. Schema.org structured data
    const jsonLd = $('script[type="application/ld+json"]');
    let address = null;

    jsonLd.each((_, el) => {
        try {
            const data = JSON.parse($(el).html());
            const addr = data.address || data?.location?.address;
            if (addr) {
                if (typeof addr === 'string') {
                    address = addr;
                } else if (addr.streetAddress) {
                    address = [
                        addr.streetAddress,
                        addr.addressLocality,
                        addr.addressRegion,
                        addr.postalCode,
                        addr.addressCountry
                    ].filter(Boolean).join(', ');
                }
            }
        } catch (e) { /* JSON inválido, seguimos */ }
    });

    if (address) return address;

    // 2. Busca en elementos con clase/id típicos de dirección
    const addressSelectors = [
        '[itemprop="address"]',
        '[class*="address"]',
        '[class*="direccion"]',
        '[class*="ubicacion"]',
        '[class*="location"]',
        '[id*="address"]',
        '[id*="direccion"]',
    ];

    for (const selector of addressSelectors) {
        const el = $(selector).first();
        if (el.length) {
            const text = el.text().trim();
            if (text.length > 10 && text.length < 300) {
                return text.replace(/\s+/g, ' ');
            }
        }
    }

    return null;
}

/**
 * Detecta páginas internas relevantes (contacto, about, etc.)
 */
export function findRelevantPages($, baseUrl) {
    const keywords = [
        'contact', 'contacto', 'contactenos', 'contáctenos', 'contato',
        'about', 'nosotros', 'sobre', 'quienes-somos', 'quien-somos',
        'about-us', 'acerca', 'empresa', 'compania', 'compañia',
        'equipo', 'team', 'staff',
        'sucursales', 'oficinas', 'offices', 'locations',
    ];

    const pages = new Set();
    const base = new URL(baseUrl);

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().toLowerCase().trim();

        try {
            const url = new URL(href, baseUrl);

            // Solo mismo dominio
            if (url.hostname !== base.hostname) return;

            const path = url.pathname.toLowerCase();
            const fullUrl = url.origin + url.pathname;

            // Matchea por path o texto del link
            const isRelevant = keywords.some(kw =>
                path.includes(kw) || text.includes(kw)
            );

            if (isRelevant && fullUrl !== baseUrl) {
                pages.add(fullUrl);
            }
        } catch (e) { /* URL inválida, ignorar */ }
    });

    return [...pages];
}
