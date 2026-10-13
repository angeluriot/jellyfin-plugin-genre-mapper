namespace Jellyfin.Plugin.GenreMapper.Configuration;

/// <summary>
/// An original genre moved into a final genre.
/// </summary>
public class GenreMapping
{
    /// <summary>
    /// Gets or sets the original genre, given by the metadata providers or set by hand.
    /// </summary>
    public string Source { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the final genre replacing it, empty to remove it from the items.
    /// </summary>
    public string Target { get; set; } = string.Empty;
}
