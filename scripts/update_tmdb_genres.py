"""
Downloads the official TMDb movie and TV genre lists in every language supported by TMDb, and saves them to
src/Jellyfin.Plugin.GenreMapper/Data/tmdb-genres.json, bundled with the plugin.

Usage: TMDB_API_KEY=<key> python scripts/update_tmdb_genres.py
"""

import json
import os
import sys
import time
import urllib.request
from pathlib import Path

API_URL = 'https://api.themoviedb.org/3'
OUTPUT = Path(__file__).resolve().parent.parent / 'src' / 'Jellyfin.Plugin.GenreMapper' / 'Data' / 'tmdb-genres.json'
KINDS = ('movie', 'tv')


def get(path, api_key, **params):
    query = '&'.join(f'{key}={value}' for key, value in {'api_key': api_key, **params}.items())
    with urllib.request.urlopen(f'{API_URL}{path}?{query}', timeout=30) as response:
        return json.load(response)


def fetch_list(api_key, kind, language):
    time.sleep(0.05)
    # Untranslated names are null, the English ones are used instead
    return {genre['id']: (genre['name'] or '').strip() or None for genre in get(f'/genre/{kind}/list', api_key, language=language)['genres']}


def main():
    api_key = os.environ.get('TMDB_API_KEY')
    if not api_key:
        sys.exit('Set the TMDB_API_KEY environment variable')

    translations = get('/configuration/primary_translations', api_key)
    # Jellyfin sends the metadata language of the library to TMDb, usually a two-letter code (like "fr"), sometimes with a region (like "pt-BR")
    codes = sorted({code.split('-')[0] for code in translations}) + sorted(translations)

    output = {}
    for kind in KINDS:
        ids = sorted(fetch_list(api_key, kind, 'en'))
        languages = {}
        for code in codes:
            names = fetch_list(api_key, kind, code)
            names = [names.get(id) for id in ids]
            base = languages.get(code.split('-')[0])
            # Untranslated languages and regional variants identical to their base language are not kept
            if any(names) and names != base:
                languages[code] = names
        output[kind] = {'ids': ids, 'languages': languages}
        print(kind, len(ids), 'genres in', len(languages), 'languages')

    lines = ['{']
    for index, kind in enumerate(KINDS):
        lines.append(f'    "{kind}": {{')
        lines.append(f'        "ids": {json.dumps(output[kind]["ids"])},')
        lines.append('        "languages": {')
        languages = output[kind]['languages']
        lines.append(',\n'.join(f'            {json.dumps(code)}: {json.dumps(names, ensure_ascii=False)}' for code, names in languages.items()))
        lines.append('        }')
        lines.append('    }' + (',' if index < len(KINDS) - 1 else ''))
    lines.append('}')

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')


if __name__ == '__main__':
    main()
