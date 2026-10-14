# Genre Mapper

A **Jellyfin** plugin that maps the genres of the items to a list of genres chosen by the administrator, directly in the metadata.

Useful when the metadata providers don't agree: for example **TMDb** gives translated genres ("Aventure", "Science-Fiction") while **TheTVDB** only has English ones ("Adventure", "Science Fiction"), which makes the genre views, filters and home sections inconsistent.

* Choose the final genres and move each original genre into one of them (or remove it)
* Applied to the existing items, the new imports and the metadata refreshes
* Preview of the changes before saving
* The original genres can be restored at any time, without changing any other metadata
* Translated in English and French

## Requirements

* **Jellyfin** `12.1`

## Installation

1. In **Dashboard > Plugins > Repositories**, add this repository:
   ```
   https://raw.githubusercontent.com/angeluriot/jellyfin-plugin-genre-mapper/main/manifest.json
   ```
2. Install **Genre Mapper** from the catalog
3. Restart the server

## Configuration

Open **Dashboard > Plugins > Genre Mapper** (also in the dashboard menu). The default configuration changes nothing.

* **Genres**: on the left, the final genres (the genres your items will have). On the right, the original genres in each of them, with their number of items:
  * By default every original genre is in the final genre of the same name, so nothing changes
  * **Move to** moves an original genre into another final genre, or removes it from the items (it then appears in "These genres will be removed")
  * The copy button duplicates an original genre, to put it in several final genres (like "Action & Adventure" in "Action" and "Aventure"), the bin next to it removes a copy
  * The name of a final genre can be edited directly, renaming it like another one merges them. The bin deletes it, its original genres are then removed from the items. **Add** creates a new final genre to move genres into (like "Arts martiaux" for "Martial Arts")
  * The original genres are the ones of your items (before the changes of the plugin), plus the official genres of the metadata fetchers enabled in your libraries (shown with a **TMDb** / **TheTVDB** badge, the genres without items can be hidden), so you can map them before they appear: the **TMDb** movie genres for the movies, the **TMDb** TV genres for the series (both in the metadata language of the library), and the **TheTVDB** genres
* **Preview**: the number of items of each genre now and after the changes, including the unsaved ones
* **Settings**: the language of the page (the one of the Jellyfin interface by default), the commit hash (see [Testing changes](#testing-changes), leave empty otherwise) and the [reset](#reset)

The original genres appearing later (new imports) are put in the final genre of the same name, so they are kept as they are until you move them.

When you save, the changes are applied to the whole library in the background (the progress is shown at the top of the page).

## How it works

The genres are changed in the Jellyfin metadata only (and in the NFO files if your libraries save them), never in the media files. Items with locked genres (or locked items) are never changed.

* **Saving the settings** runs the **Apply the genre mapping** scheduled task (Dashboard > Scheduled tasks), which maps the genres of all the movies, series, seasons, episodes, collections, music videos, trailers and videos (music genres are left untouched). It also runs once a day and can be run manually
* After applying the mapping, the genre items (the genres listed by Jellyfin, with their page) are updated without waiting for a library scan. Jellyfin matches them with the genres of the items without case, accents or punctuation, and never removes the old ones when a genre is renamed to a similar name (like "Science-Fiction" to "Science fiction"), so the plugin replaces them by a genre item with the new name (only the genre items are deleted, never files)
* **New imports and metadata refreshes** are mapped by a metadata provider that Jellyfin runs after the other providers, before saving the item, so a refresh never brings the provider genres back
* Every change is logged, and the original genres of each changed item are saved in `plugins/configurations/Jellyfin.Plugin.GenreMapper/original-genres.json`
* The mapping is always applied to the original genres, never to genres it already changed: a genre can be both a final genre and moved into another one (like "Drama" → "Drame" and "Drame" → "Action"), and changing the mapping later gives the same result as if it had always been that one. Genres changed by something else since the last change of the plugin (like a metadata refresh or a manual edit) are the new original genres

### Reset

The **Reset** button of the settings resets the mapping (every genre is kept) and applies it, which restores the original genres of the items changed by the plugin. Only the genres are restored, the other metadata (like manual edits) is untouched. Items whose genres were changed by something else since (like a manual edit) keep their current genres.

A Jellyfin metadata refresh was not used for this because it can't be limited to the genres, it would replace the other metadata too.

## Testing changes

To test changes to the web files (`src/Jellyfin.Plugin.GenreMapper/Web`) on a real server without installing a new version, push them to GitHub and enter the commit hash in the settings: the settings page script and the translations are then loaded from this commit through [jsDelivr](https://www.jsdelivr.com/). Changes to the C# code still require a new build.

## Adding a language

Copy `src/Jellyfin.Plugin.GenreMapper/Web/Localization/en.json` to `<code>.json` (like `de.json` or `pt-BR.json`) and translate it, `LanguageName` being the name of the language in that language. Missing strings fall back to English.

## Updating the genre lists

The official genre lists are bundled with the plugin as they rarely change:

* `Data/tmdb-genres.json`: the **TMDb** movie and TV genres in every language, generated by `TMDB_API_KEY=<key> python scripts/update_tmdb_genres.py`
* `Data/tvdb-genres.json`: the 35 **TheTVDB** genres, from [thetvdb.com/genres](https://thetvdb.com/genres)

## Development

Build with the [.NET 10 SDK](https://dotnet.microsoft.com/download):

```
dotnet build src/Jellyfin.Plugin.GenreMapper -c Release
```

Then copy `Jellyfin.Plugin.GenreMapper.dll` from `bin/Release/net10.0` to a folder in the `plugins` folder of your server and restart it.

To publish a version, run the **Release** workflow from the GitHub Actions tab with a version number and a changelog: it builds the plugin, creates the GitHub release and adds the version to `manifest.json`.
