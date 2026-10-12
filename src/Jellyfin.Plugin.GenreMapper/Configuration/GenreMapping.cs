namespace Jellyfin.Plugin.GenreMapper.Configuration;

/// <summary>
/// A source genre linked to a target genre.
/// </summary>
public class GenreMapping
{
    /// <summary>
    /// Gets or sets the genre given by the metadata providers.
    /// </summary>
    public string Source { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the target genre replacing it, empty to remove it from the items.
    /// </summary>
    public string Target { get; set; } = string.Empty;
}
