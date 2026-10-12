using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.GenreMapper.Configuration;

/// <summary>
/// The configuration of the plugin.
/// </summary>
/// <remarks>The empty default mapping changes nothing: every genre is kept as it is.</remarks>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets an optional commit of the GitHub repository to load the web files from, to test changes without rebuilding the plugin.
    /// </summary>
    public string CommitHash { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the language of the settings page, empty to use the language of the Jellyfin interface.
    /// </summary>
    public string Language { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the genres to keep, they are never changed.
    /// </summary>
    /// <remarks>Arrays (and not lists) so the XML serializer replaces the defaults instead of appending to them.</remarks>
    public string[] TargetGenres { get; set; } = [];

    /// <summary>
    /// Gets or sets the target genre of the other genres, the genres without mapping are kept as they are.
    /// </summary>
    public GenreMapping[] Mappings { get; set; } = [];
}
