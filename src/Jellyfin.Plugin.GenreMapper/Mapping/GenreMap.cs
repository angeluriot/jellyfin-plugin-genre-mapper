using Jellyfin.Plugin.GenreMapper.Configuration;

namespace Jellyfin.Plugin.GenreMapper.Mapping;

/// <summary>
/// The mapping of the genres, built from the configuration.
/// </summary>
/// <remarks>
/// The mapping is always applied to the original genres of the items (see <see cref="GenreHistory"/>), never to genres it already mapped,
/// so a genre can be both a final genre and mapped to another one (like "Drama" → "Drame" and "Drame" → "Drama").
/// </remarks>
public sealed class GenreMap
{
    private static CachedMap? _current;

    // Final genre of each original genre, empty to remove it
    private readonly Dictionary<string, string> _mappings;

    private GenreMap(Dictionary<string, string> mappings)
    {
        _mappings = mappings;
    }

    /// <summary>
    /// Builds a mapping.
    /// </summary>
    /// <param name="mappings">The final genre of the original genres, the other genres are kept as they are.</param>
    /// <returns>The mapping.</returns>
    public static GenreMap Create(IEnumerable<GenreMapping> mappings)
    {
        Dictionary<string, string> result = new(StringComparer.Ordinal);

        foreach (GenreMapping mapping in mappings)
        {
            string source = mapping.Source.Trim();
            string target = mapping.Target.Trim();

            // Genres mapped to themselves are kept anyway
            if (source.Length > 0 && source != target)
            {
                result[source] = target;
            }
        }

        return new GenreMap(result);
    }

    /// <summary>
    /// Gets the mapping of the current configuration of the plugin.
    /// </summary>
    /// <returns>The mapping.</returns>
    public static GenreMap FromConfiguration()
    {
        PluginConfiguration configuration = Plugin.Instance?.Configuration ?? new PluginConfiguration();

        // Saving the configuration replaces the configuration object, so the mapping is only built once per configuration
        CachedMap? current = _current;
        if (current is not null && ReferenceEquals(current.Configuration, configuration))
        {
            return current.Map;
        }

        GenreMap map = Create(configuration.Mappings);
        _current = new CachedMap(configuration, map);
        return map;
    }

    /// <summary>
    /// Maps a list of original genres, without duplicates and keeping their order.
    /// </summary>
    /// <param name="genres">The original genres.</param>
    /// <returns>The mapped genres.</returns>
    public string[] Map(IEnumerable<string> genres)
    {
        // Jellyfin stores the genres without case-insensitive duplicates
        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
        List<string> result = [];

        foreach (string genre in genres)
        {
            string mapped = _mappings.TryGetValue(genre, out string? target) ? target : genre;

            if (mapped.Length > 0 && seen.Add(mapped))
            {
                result.Add(mapped);
            }
        }

        return [.. result];
    }

    private sealed record CachedMap(PluginConfiguration Configuration, GenreMap Map);
}
