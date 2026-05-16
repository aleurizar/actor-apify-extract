// ============================================================
// extractors.js — Funciones para extraer datos de contacto del HTML
// v2: Mejoras en filtrado de teléfonos, detección de redes y dirección
// ============================================================

/**
 * Patrones de redes sociales — detecta URLs en href y texto
 * v2: YouTube y TikTok con más variantes
 */
const SOCIAL_PATTERNS = {
    linkedin: /https?:\/\/(www\.)?linkedin\.com\/(company|in|school)\/[a-zA-Z0-9_-]+\/?/gi,
    facebook: /https?:\/\/(www\.)?(facebook|fb)\.com\/[a-zA-Z0-9._-]+\/?/gi,
    instagram: /https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+\/?/gi,
    twitter: /https?:\/\/(www\.)?(twitter|x)\.com\/[a-zA-Z0-9_]+\/?/gi,
    youtube: /https?:\/\/(www\.)?youtube\.com\/(channel\/|c\/|user\/|@)?[a-zA-Z0-9_-]+\/?/gi,
    tiktok: /https?:\/\/(www\.)?tiktok\.com\/@?[a-zA-Z0-9._-]+\/?/gi,
};

/**
 * URLs de redes sociales que son genéricas (no son perfiles de empresa)
 */
const SOCIAL_BLOCKLIST = [
    '/sharer', '/share', '/intent/', '/hashtag/', '/home', '/login',
    '/signup', '/register', '/watch', '/feed', '/explore', '/reels',
    '/policies', '/privacy', '/terms', '/help', '/about', '/legal',
    'youtube.com/watch', 'youtube.com/embed', 'youtube.com/playlist',
    'tiktok.com/embed', 'tiktok.com/legal', 'tiktok.com/login',
    'facebook.com/sharer', 'facebook.com/plugins', 'facebook.com/tr',
    'twitter.com/intent', 'twitter.com/share',
];

/**
 * Patrón de email
 */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Emails que no son de contacto real (tracking, sistema, etc.)
 */
const EMAIL_BLOCKLIST = [
    'example.com', 'sentry', 'wixpress', 'cloudflare', 'googleapis',
    'googletagmanager', 'facebook.com', 'twitter.com', 'schema.org',
    'w3.org', 'jquery', 'bootstrap', 'webpack', 'localhost',
    'your-email', 'email@', 'test@', 'noreply', 'no-reply',
    'unsubscribe', 'mailer-daemon', 'postmaster',
    '.png', '.jpg', '.webp', '.gif', '.svg', '.css', '.js',
];

/**
 * Extrae redes sociales del HTML
 */
export function extractSocials($) {
    const socials = {};

    // Prioriza links del footer y header (más probables de ser oficiales)
    const prioritySelectors = ['footer', 'header', '[class*="social"]', '[class*="redes"]', '[class*="follow"]', 'body'];

    for (const selector of prioritySelectors) {
        const container = $(selector);
        if (!container.length) continue;

        container.find('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';

            for (const [network, pattern] of Object.entries(SOCIAL_PATTERNS)) {
                if (socials[network]) continue; // Ya tenemos este
                pattern.lastIndex = 0;

                if (pattern.test(href)) {
                    const clean = href.replace(/\/$/, '').toLowerCase().split('?')[0];

                    // Verifica que no sea un link genérico
                    const isBlocked = SOCIAL_BLOCKLIST.some(b => clean.includes(b));
                    if (!isBlocked) {
                        socials[network] = clean;
                    }
                }
                pattern.lastIndex = 0;
            }
        });

        // Si ya tenemos todas, salimos
        if (Object.keys(socials).length >= 6) break;
    }

    return socials;
}

/**
 * Valida si un string parece un teléfono real de LATAM
 * v2: Filtra agresivamente IDs de tracking, cookies, timestamps
 */
function isRealPhone(raw) {
    // Limpia todo excepto dígitos, +, -, (, ), espacios
    const cleaned = raw.replace(/[^\d+\-() ]/g, '');
    const digitsOnly = cleaned.replace(/\D/g, '');

    // Rechaza si tiene muy pocos o demasiados dígitos
    if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;

    // Rechaza si parece un decimal/float (tiene punto en el original)
    if (/\d+\.\d+\.\d+/.test(raw)) return false;
    if (/\d{5,}\.\d{5,}/.test(raw)) return false;

    // Rechaza si es un número con demasiados puntos (IDs de analytics)
    const dotCount = (raw.match(/\./g) || []).length;
    if (dotCount >= 2) return false;

    // Rechaza años (1900-2099)
    if (/^(19|20)\d{2}$/.test(digitsOnly)) return false;

    // Rechaza si parece un timestamp Unix
    if (digitsOnly.length >= 10 && digitsOnly.length <= 13 && /^1[4-9]\d{8,11}$/.test(digitsOnly)) return false;

    // Rechaza si parece un código postal solo
    if (digitsOnly.length <= 5) return false;

    // Acepta formatos LATAM comunes
    const validPatterns = [
        /^\+?\d{1,3}[\s-]?\(?\d{1,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}$/,
        /^\(?\d{2,4}\)?\s?\d{4}[\s-]?\d{4}$/,
        /^\d{3,4}[\s-]\d{3,4}$/,
        /^\+\d{7,15}$/,
        /^0\d{2,3}[\s-]?\d{3,4}[\s-]?\d{3,4}$/,
        /^\d{7,11}$/,
    ];

    return validPatterns.some(p => p.test(cleaned));
}

/**
 * Extrae teléfonos del HTML
 * v2: Prioriza tel: links, filtra agresivamente números falsos
 */
export function extractPhones($) {
    const phones = new Set();

    // 1. PRIORIDAD ALTA: links tel: (son teléfonos seguros)
    $('a[href^="tel:"]').each((_, el) => {
        const tel = $(el).attr('href').replace('tel:', '').replace(/\s/g, '').trim();
        if (tel.length >= 7 && isRealPhone(tel)) {
            phones.add(tel);
        }
    });

    // 2. PRIORIDAD ALTA: links whatsapp
    $('a[href*="wa.me"], a[href*="whatsapp"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/[\d+]{8,15}/);
        if (match && isRealPhone(match[0])) {
            phones.add(match[0]);
        }
    });

    // 3. PRIORIDAD MEDIA: Texto cerca de keywords de teléfono
    const phoneKeywords = ['tel', 'teléfono', 'telefono', 'phone', 'celular', 'móvil', 'movil', 'whatsapp', 'llamar', 'call'];
    const phoneRegex = /\+?\(?\d[\d\s()\-./]{6,18}\d/g;

    $('footer, [class*="contact"], [class*="contacto"], [class*="phone"], [class*="telefono"], [id*="contact"], [id*="footer"]').each((_, section) => {
        const text = $(section).text();
        const matches = text.match(phoneRegex);
        if (matches) {
            matches.forEach(m => {
                if (isRealPhone(m.trim())) {
                    phones.add(m.trim());
                }
            });
        }
    });

    // 4. PRIORIDAD BAJA: Texto general del body, solo cerca de keywords
    if (phones.size === 0) {
        const bodyText = $('body').text();
        const lines = bodyText.split('\n');
        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            const hasKeyword = phoneKeywords.some(kw => lowerLine.includes(kw));
            if (hasKeyword) {
                const matches = line.match(phoneRegex);
                if (matches) {
                    matches.forEach(m => {
                        if (isRealPhone(m.trim())) {
                            phones.add(m.trim());
                        }
                    });
                }
            }
        }
    }

    return [...phones].slice(0, 5);
}

/**
 * Extrae emails del HTML
 * v2: Mejor filtrado de emails de sistema
 */
export function extractEmails($) {
    const emails = new Set();

    // 1. Links mailto: (alta confianza)
    $('a[href^="mailto:"]').each((_, el) => {
        const email = $(el).attr('href').replace('mailto:', '').split('?')[0].trim().toLowerCase();
        if (email && !EMAIL_BLOCKLIST.some(b => email.includes(b))) {
            emails.add(email);
        }
    });

    // 2. Texto en secciones de contacto/footer
    const contactSections = $('footer, [class*="contact"], [class*="contacto"], [id*="contact"], [id*="footer"]');
    const sectionText = contactSections.length ? contactSections.text() : '';

    const sectionMatches = sectionText.match(EMAIL_PATTERN);
    if (sectionMatches) {
        sectionMatches.forEach(e => {
            const email = e.toLowerCase();
            if (!EMAIL_BLOCKLIST.some(b => email.includes(b))) {
                emails.add(email);
            }
        });
    }

    // 3. Si no encontramos nada, buscar en todo el body
    if (emails.size === 0) {
        const bodyText = $('body').text();
        const matches = bodyText.match(EMAIL_PATTERN);
        if (matches) {
            matches.forEach(e => {
                const email = e.toLowerCase();
                if (!EMAIL_BLOCKLIST.some(b => email.includes(b))) {
                    emails.add(email);
                }
            });
        }
    }

    return [...emails].slice(0, 5);
}

/**
 * Extrae dirección física del HTML
 * v2: Busca en footer, schema.org con recursión, más selectores
 */
export function extractAddress($) {
    // 1. Schema.org structured data (busca recursivamente)
    const jsonLd = $('script[type="application/ld+json"]');
    let address = null;

    jsonLd.each((_, el) => {
        if (address) return;
        try {
            const data = JSON.parse($(el).html());
            const addr = findAddressInObject(data);
            if (addr) address = addr;
        } catch (e) { /* JSON inválido, seguimos */ }
    });

    if (address) return address;

    // 2. Microdata (itemprop)
    const microAddr = $('[itemprop="address"]').first();
    if (microAddr.length) {
        const street = microAddr.find('[itemprop="streetAddress"]').text().trim();
        const locality = microAddr.find('[itemprop="addressLocality"]').text().trim();
        const region = microAddr.find('[itemprop="addressRegion"]').text().trim();
        const postal = microAddr.find('[itemprop="postalCode"]').text().trim();
        const combined = [street, locality, region, postal].filter(Boolean).join(', ');
        if (combined.length > 10) return combined;
    }

    // 3. Busca en footer y secciones de contacto
    const addressSelectors = [
        'footer [class*="address"]',
        'footer [class*="direccion"]',
        'footer [class*="ubicacion"]',
        'footer [class*="location"]',
        '[class*="contact"] [class*="address"]',
        '[class*="contacto"] [class*="direccion"]',
        '[class*="address"]',
        '[class*="direccion"]',
        '[class*="ubicacion"]',
        '[class*="location"]:not([class*="geo"])',
        '[id*="address"]',
        '[id*="direccion"]',
    ];

    for (const selector of addressSelectors) {
        const el = $(selector).first();
        if (el.length) {
            const text = el.text().trim().replace(/\s+/g, ' ');
            if (text.length > 10 && text.length < 300) {
                return text;
            }
        }
    }

    // 4. Busca en el footer por patrones de dirección LATAM
    const footer = $('footer').text() || '';
    const addressPatterns = [
        /((?:Av\.?|Avenida|Calle|Jr\.?|Jirón|Carrera|Rua|Rúa|Paseo|Blvd\.?|Boulevard)\s+[^,\n]{5,50},\s*[^,\n]{3,30}(?:,\s*[^,\n]{3,30})?)/i,
        /([A-Z][a-záéíóúñ]+\s+\d{1,5}[^,\n]{0,30},\s*(?:C\.?P\.?\s*)?\d{4,6}[^,\n]{0,30})/i,
    ];

    for (const pattern of addressPatterns) {
        const match = footer.match(pattern);
        if (match) {
            return match[1].trim().replace(/\s+/g, ' ');
        }
    }

    return null;
}

/**
 * Busca recursivamente un objeto address en datos JSON-LD
 */
function findAddressInObject(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 5) return null;

    if (obj.address) {
        const addr = obj.address;
        if (typeof addr === 'string' && addr.length > 5) return addr;
        if (addr.streetAddress) {
            return [
                addr.streetAddress,
                addr.addressLocality,
                addr.addressRegion,
                addr.postalCode,
                addr.addressCountry
            ].filter(Boolean).join(', ');
        }
    }

    if (Array.isArray(obj)) {
        for (const item of obj) {
            const result = findAddressInObject(item, depth + 1);
            if (result) return result;
        }
    }

    for (const key of Object.keys(obj)) {
        if (key === 'address') continue;
        if (typeof obj[key] === 'object') {
            const result = findAddressInObject(obj[key], depth + 1);
            if (result) return result;
        }
    }

    return null;
}

/**
 * Detecta páginas internas relevantes (contacto, about, etc.)
 * v2: Más keywords en español/portugués, busca también en footer
 */
export function findRelevantPages($, baseUrl) {
    const keywords = [
        'contact', 'contacto', 'contactenos', 'contáctenos', 'contato', 'fale-conosco',
        'about', 'nosotros', 'sobre', 'quienes-somos', 'quien-somos', 'sobre-nos',
        'about-us', 'acerca', 'empresa', 'compania', 'compañia', 'institucional',
        'equipo', 'team', 'staff', 'nuestra-empresa', 'la-empresa',
        'sucursales', 'oficinas', 'offices', 'locations', 'sedes',
        'donde-estamos', 'encuentranos', 'find-us',
    ];

    const pages = new Set();
    const base = new URL(baseUrl);

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().toLowerCase().trim();

        try {
            const url = new URL(href, baseUrl);

            if (url.hostname !== base.hostname) return;
            if (url.pathname === '/' || url.pathname === '') return;
            if (/\.(pdf|jpg|png|gif|svg|css|js|zip)$/i.test(url.pathname)) return;

            const path = url.pathname.toLowerCase();
            const fullUrl = url.origin + url.pathname;

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
