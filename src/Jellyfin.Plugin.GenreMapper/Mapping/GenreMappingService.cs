using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.GenreMapper.Mapping;

/// <summary>
/// Applies the mapping to the original genres of the items.
/// </summary>
public class GenreMappingService
{
    /// <summary>
    /// The types of the items whose genres are mapped (the music genres are left untouched).
    /// </summary>
    public static readonly BaseItemKind[] ItemTypes =
    [
        BaseItemKind.Movie,
        BaseItemKind.Series,
        BaseItemKind.Season,
        BaseItemKind.Episode,
        BaseItemKind.BoxSet,
        BaseItemKind.MusicVideo,
        BaseItemKind.Trailer,
        BaseItemKind.Video
    ];

    private readonly ILibraryManager _libraryManager;
    private readonly GenreHistory _history;
    private readonly ILogger<GenreMappingService> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="GenreMappingService"/> class.
    /// </summary>
    /// <param name="libraryManager">Instance of the <see cref="ILibraryManager"/> interface.</param>
    /// <param name="history">The original genres of the changed items.</param>
    /// <param name="logger">Instance of the <see cref="ILogger{GenreMappingService}"/> interface.</param>
    public GenreMappingService(ILibraryManager libraryManager, GenreHistory history, ILogger<GenreMappingService> logger)
    {
        _libraryManager = libraryManager;
        _history = history;
        _logger = logger;
    }

    /// <summary>
    /// Gets a value indicating whether the genres of an item can be changed (the item and its genres are not locked).
    /// </summary>
    /// <param name="item">The item.</param>
    /// <returns><c>true</c> if the genres can be changed.</returns>
    public static bool CanChangeGenres(BaseItem item) => !item.IsLocked && !item.LockedFields.Contains(MetadataField.Genres);

    /// <summary>
    /// Gets all the items whose genres are mapped.
    /// </summary>
    /// <returns>The items.</returns>
    public IReadOnlyList<BaseItem> GetItems() => _libraryManager.GetItemList(new InternalItemsQuery
    {
        IncludeItemTypes = ItemTypes,
        Recursive = true
    });

    /// <summary>
    /// Gets the original genres of an item: the ones before the changes of the plugin, if the plugin changed them.
    /// </summary>
    /// <param name="item">The item.</param>
    /// <returns>The original genres.</returns>
    public string[] GetOriginalGenres(BaseItem item) => _history.GetOriginal(item.Id, item.Genres);

    /// <summary>
    /// Gets the genres an item would have with a mapping.
    /// </summary>
    /// <param name="item">The item.</param>
    /// <param name="map">The mapping.</param>
    /// <returns>The mapped genres, or the current ones if they can't be changed.</returns>
    public string[] GetMappedGenres(BaseItem item, GenreMap map) => CanChangeGenres(item) ? map.Map(GetOriginalGenres(item)) : item.Genres;

    /// <summary>
    /// Maps the original genres of an item, without saving it, and records the change.
    /// </summary>
    /// <param name="item">The item.</param>
    /// <param name="map">The mapping.</param>
    /// <returns><c>true</c> if the genres changed.</returns>
    public bool MapGenres(BaseItem item, GenreMap map)
    {
        if (!CanChangeGenres(item))
        {
            return false;
        }

        string[] before = item.Genres;
        string[] original = GetOriginalGenres(item);
        string[] after = map.Map(original);
        if (before.SequenceEqual(after, StringComparer.Ordinal))
        {
            return false;
        }

        _logger.LogInformation(
            "Genres of {ItemName} ({ItemId}) changed from [{Before}] to [{After}] (original genres: [{Original}])",
            item.Name,
            item.Id,
            string.Join(", ", before),
            string.Join(", ", after),
            string.Join(", ", original));

        item.Genres = after;
        _history.Record(item.Id, original, after);
        return true;
    }

    /// <summary>
    /// Applies the mapping to all the items.
    /// </summary>
    /// <param name="progress">The progress, from 0 to 100.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The number of changed items.</returns>
    public async Task<int> ApplyAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        // Also run with an empty mapping, which restores the original genres
        GenreMap map = GenreMap.FromConfiguration();
        IReadOnlyList<BaseItem> items = GetItems();
        HashSet<string> genres = new(StringComparer.OrdinalIgnoreCase);
        int changed = 0;

        try
        {
            for (int index = 0; index < items.Count; index++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                BaseItem item = items[index];

                if (MapGenres(item, map))
                {
                    await item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit, cancellationToken).ConfigureAwait(false);
                    genres.UnionWith(item.Genres);
                    changed++;
                }

                progress.Report(95.0 * (index + 1) / items.Count);
            }
        }
        finally
        {
            _history.Save();
        }

        await CreateGenresAsync(genres, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Genre mapping applied, {Count} items changed", changed);
        progress.Report(100);
        return changed;
    }

    /// <summary>
    /// Creates the genre items that don't exist yet, so the new genres are listed without waiting for a library scan.
    /// </summary>
    /// <remarks>The genres without items anymore are removed by the next library scan.</remarks>
    private async Task CreateGenresAsync(IEnumerable<string> names, CancellationToken cancellationToken)
    {
        HashSet<string> existing = new(
            _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = [BaseItemKind.Genre] }).Select(genre => genre.Name),
            StringComparer.OrdinalIgnoreCase);

        foreach (string name in names.Where(name => !existing.Contains(name)))
        {
            try
            {
                Genre genre = _libraryManager.GetGenre(name);
                await genre.RefreshMetadata(cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                _logger.LogError(exception, "Failed to create the genre {Name}", name);
            }
        }
    }
}
