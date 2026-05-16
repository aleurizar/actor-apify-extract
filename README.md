# Contact Scraper LATAM 🌎

Actor de Apify que extrae datos de contacto de empresas latinoamericanas a partir de un CSV con nombre + país.

## Qué hace

1. **Lee un CSV** con columnas `empresa` y `pais`
2. **Busca en Google** el sitio web oficial de cada empresa
3. **Crawlea** las páginas de contacto, about, nosotros, etc.
4. **Extrae** y devuelve:
   - Redes sociales (LinkedIn, Facebook, Instagram, Twitter/X, YouTube, TikTok)
   - Teléfonos
   - Emails
   - Dirección física

## Input

### Opción A: URL de CSV
Publicá tu Google Sheet como CSV y usá ese link:
```
Archivo → Compartir → Publicar en la web → CSV
```

### Opción B: Pegar CSV directo
Pegá el contenido del CSV en el campo "CSV directo":
```
empresa,pais
Globant,Argentina
Despegar,Argentina
Rappi,Colombia
Mercado Libre,Argentina
```

### Columnas aceptadas
El parser es flexible con los nombres:
- Empresa: `empresa`, `company`, `nombre`, `name`, `razon_social`
- País: `pais`, `país`, `country`, `region`

## Output

Cada fila del dataset tiene:

| Campo      | Ejemplo                                      |
|------------|----------------------------------------------|
| empresa    | Globant                                      |
| pais       | Argentina                                    |
| website    | https://globant.com                          |
| linkedin   | https://linkedin.com/company/globant         |
| facebook   | https://facebook.com/globant                 |
| instagram  | https://instagram.com/globant                |
| twitter    | https://x.com/globant                        |
| phones     | ["+54 11 5789-0000"]                         |
| emails     | ["info@globant.com"]                         |
| address    | Ing. Butty 240, CABA, Argentina              |
| status     | OK / WEBSITE_NOT_FOUND                       |

## Configuración

- **maxPagesPerSite**: Cuántas páginas internas visitar (default: 5)
- **proxyConfig**: Se recomienda proxy residencial para las búsquedas de Google

## Deploy en Apify

1. Crear actor nuevo en [Apify Console](https://console.apify.com/actors)
2. Elegir "Development" → "Multifile"
3. Subir todos los archivos de este proyecto
4. Click en "Build"
5. Configurar input y "Start"

## Costo estimado

- ~$0.01 USD por empresa (búsqueda Google + crawling de 3-5 páginas)
- Con proxy residencial, ~$0.03 USD por empresa
- 100 empresas ≈ $1-3 USD

## Notas

- El actor usa `apify/google-search-scraper` para buscar sitios. Necesitás tenerlo habilitado en tu cuenta.
- Las búsquedas de Google tienen una pausa de 2-5 segundos entre cada una para evitar bloqueos.
- Si una empresa no se encuentra, aparece con `status: WEBSITE_NOT_FOUND` en el output.
