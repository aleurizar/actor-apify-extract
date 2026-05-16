// ============================================================
// csv-parser.js — Parsea el CSV de entrada (empresa, pais)
// ============================================================

import { parse } from 'csv-parse/sync';

/**
 * Parsea el CSV y devuelve un array de { empresa, pais }
 *
 * Acepta variaciones de nombres de columna:
 * - empresa, company, nombre, name, razon_social
 * - pais, country, país, pais_origen
 *
 * @param {string} csvContent - Contenido del CSV como string
 * @returns {Array<{empresa: string, pais: string}>}
 */
export function parseCompanyCSV(csvContent) {
    const records = parse(csvContent, {
        columns: true,          // Usa la primera fila como headers
        skip_empty_lines: true,
        trim: true,
        bom: true,              // Maneja BOM de Excel
        relaxColumnCount: true,
        delimiter: [',', ';', '\t'], // Acepta varios separadores
    });

    if (records.length === 0) {
        throw new Error('El CSV está vacío o no tiene datos.');
    }

    // Mapea columnas flexiblemente
    const empresaKeys = ['empresa', 'company', 'nombre', 'name', 'razon_social', 'razón social', 'compañia', 'compania'];
    const paisKeys = ['pais', 'país', 'country', 'pais_origen', 'region'];

    const firstRow = records[0];
    const columns = Object.keys(firstRow).map(k => k.toLowerCase().trim());

    const empresaCol = Object.keys(firstRow).find(k =>
        empresaKeys.includes(k.toLowerCase().trim())
    );
    const paisCol = Object.keys(firstRow).find(k =>
        paisKeys.includes(k.toLowerCase().trim())
    );

    if (!empresaCol) {
        throw new Error(
            `No se encontró columna de empresa. Columnas detectadas: ${columns.join(', ')}. ` +
            `Esperaba alguna de: ${empresaKeys.join(', ')}`
        );
    }

    console.log(`Columnas mapeadas → empresa: "${empresaCol}", pais: "${paisCol || 'no detectada'}"`);

    return records
        .map(row => ({
            empresa: (row[empresaCol] || '').trim(),
            pais: paisCol ? (row[paisCol] || '').trim() : 'Argentina', // Default Argentina
        }))
        .filter(r => r.empresa.length > 0);
}
