using Jellyfin.Plugin.GenreMapper.Configuration;

namespace Jellyfin.Plugin.GenreMapper.Mapping;

/// <summary>
/// The mapping of the genres, built from the configuration.
/// </summary>
/// <remarks>
/// The target genres are always kept and the other genres can only be mapped to a target genre,
/// so mapping genres a second time never changes them again.
/// </remarks>
public sealed class GenreMap
{
    private static CachedMap? _current;

    private readonly HashSet<string> _targets;

    // Target genre of each mapped genre, empty to remove it
    private readonly Dictionary<string, string> _mappings;

    private GenreMap(HashSet<string> targets, Dictionary<string, string> mappings)
    {
        _targets = targets;
        _mappings = mappings;
    }

    /// <summary>
    /// Gets a value indicating whether the mapping changes nothing.
    /// </summary>
    public bool IsEmpty => _mappings.Count == 0;

    /// <summary>
    /// Builds the mapping of a configuration, ignoring the invalid mappings.
    /// </summary>
    /// <param name="targetGenres">The genres to keep.</param>
    /// <param name="mappings">The target genre of the other genres.</param>
    /// <returns>The mapping.</returns>
    public static GenreMap Create(IEnumerable<string> targetGenres, IEnumerable<GenreMapping> mappings)
    {
        HashSet<string> targets = new(targetGenres.Select(genre => genre.Trim()).Where(genre => genre.Length > 0), StringComparer.Ordinal);
        Dictionary<string, string> result = new(StringComparer.Ordinal);

        foreach (GenreMapping mapping in mappings)
        {
            string source = mapping.Source.Trim();
            string target = mapping.Target.Trim();

            if (source.Length > 0 && !targets.Contains(source) && (target.Length == 0 || targets.Contains(target)))
            {
                result[source] = target;
            }
        }

        return new GenreMap(targets, result);
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

        GenreMap map = Create(configuration.TargetGenres, configuration.Mappings);
        _current = new CachedMap(configuration, map);
        return map;
    }

    /// <summary>
    /// Maps a list of genres, without duplicates and keeping their order.
    /// </summary>
    /// <param name="genres">The genres.</param>
    /// <returns>The mapped genres.</returns>
    public string[] Map(IEnumerable<string> genres)
    {
        // Jellyfin stores the genres without case-insensitive duplicates
        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
        List<string> result = [];

        foreach (string genre in genres)
        {
            string mapped = !_targets.Contains(genre) && _mappings.TryGetValue(genre, out string? target) ? target : genre;

            if (mapped.Length > 0 && seen.Add(mapped))
            {
                result.Add(mapped);
            }
        }

        return [.. result];
    }

    private sealed record CachedMap(PluginConfiguration Configuration, GenreMap Map);
}
