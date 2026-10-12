namespace Jellyfin.Plugin.GenreMapper.Genres;

/// <summary>
/// A genre with its names in every known language, used to suggest merges of genres meaning the same thing.
/// </summary>
public class GenreConcept
{
    /// <summary>
    /// Gets the preferred name of the genre in each language.
    /// </summary>
    public Dictionary<string, string> Names { get; } = [];

    /// <summary>
    /// Gets all the names of the genre in each language (like the TMDb movie and TV names).
    /// </summary>
    public Dictionary<string, List<string>> Aliases { get; } = [];

    /// <summary>
    /// Gets or sets the name of the genre on TheTVDB (only in English), if any.
    /// </summary>
    public string? Tvdb { get; set; }
}
