using Jellyfin.Plugin.GenreMapper.Configuration;

namespace Jellyfin.Plugin.GenreMapper.Api.Models;

/// <summary>
/// A mapping to preview, not saved yet.
/// </summary>
public class PreviewRequest
{
    /// <summary>
    /// Gets or sets the final genre of the original genres.
    /// </summary>
    public GenreMapping[] Mappings { get; set; } = [];
}

/// <summary>
/// The changes a mapping would make.
/// </summary>
public class PreviewResult
{
    /// <summary>
    /// Gets or sets the number of items whose genres would change.
    /// </summary>
    public int ChangedItems { get; set; }

    /// <summary>
    /// Gets or sets the number of items of the genres whose number of items would change.
    /// </summary>
    public IReadOnlyList<GenrePreview> Genres { get; set; } = [];
}

/// <summary>
/// The number of items of a genre before and after a mapping.
/// </summary>
public class GenrePreview
{
    /// <summary>
    /// Gets or sets the name of the genre.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the number of items having the genre now.
    /// </summary>
    public int Before { get; set; }

    /// <summary>
    /// Gets or sets the number of items having the genre after the mapping.
    /// </summary>
    public int After { get; set; }
}
