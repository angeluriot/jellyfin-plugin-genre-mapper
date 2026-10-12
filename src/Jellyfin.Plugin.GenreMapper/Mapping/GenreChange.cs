namespace Jellyfin.Plugin.GenreMapper.Mapping;

/// <summary>
/// A change of the genres of an item made by the plugin.
/// </summary>
public class GenreChange
{
    /// <summary>
    /// Gets or sets the genres before the first change of the plugin.
    /// </summary>
    public string[] Original { get; set; } = [];

    /// <summary>
    /// Gets or sets the genres after the last change of the plugin.
    /// </summary>
    public string[] Mapped { get; set; } = [];
}
