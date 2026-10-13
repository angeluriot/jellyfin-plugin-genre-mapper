namespace Jellyfin.Plugin.GenreMapper.Api.Models;

/// <summary>
/// The data needed by the settings page.
/// </summary>
public class PageData
{
    /// <summary>
    /// Gets or sets a string that changes whenever the web files change, to bypass browser caches.
    /// </summary>
    public string Version { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the languages the plugin is translated into.
    /// </summary>
    public IReadOnlyList<LanguageInfo> Languages { get; set; } = [];

    /// <summary>
    /// Gets or sets the known source genres: the official genres of the metadata providers and the genres of the items.
    /// </summary>
    public IReadOnlyList<SourceGenre> Genres { get; set; } = [];

    /// <summary>
    /// Gets or sets the number of items whose original genres can be restored.
    /// </summary>
    public int RestorableItems { get; set; }
}

/// <summary>
/// A language the plugin is translated into.
/// </summary>
public class LanguageInfo
{
    /// <summary>
    /// Gets or sets the language code, like <c>en</c> or <c>fr</c>.
    /// </summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the name of the language in that language.
    /// </summary>
    public string Name { get; set; } = string.Empty;
}

/// <summary>
/// A known source genre.
/// </summary>
public class SourceGenre
{
    /// <summary>
    /// Gets or sets the name of the genre.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the number of items having the genre.
    /// </summary>
    public int Count { get; set; }

    /// <summary>
    /// Gets or sets the metadata providers having the genre in their official list: <c>TMDb</c> or <c>TheTVDB</c>.
    /// </summary>
    public IReadOnlyList<string> Origins { get; set; } = [];
}
