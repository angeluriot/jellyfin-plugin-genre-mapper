using Jellyfin.Plugin.GenreMapper.Mapping;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;

namespace Jellyfin.Plugin.GenreMapper.Providers;

/// <summary>
/// Maps the genres of the items when their metadata is refreshed (import, library scan or manual refresh).
/// </summary>
/// <remarks>
/// Jellyfin runs the custom providers after merging the results of the local and remote providers, and saves the item once
/// after them, so the genres given by the providers are mapped before being saved, without extra update.
/// </remarks>
public class GenreMappingProvider :
    ICustomMetadataProvider<Movie>,
    ICustomMetadataProvider<Series>,
    ICustomMetadataProvider<Season>,
    ICustomMetadataProvider<Episode>,
    ICustomMetadataProvider<BoxSet>,
    ICustomMetadataProvider<MusicVideo>,
    ICustomMetadataProvider<Trailer>,
    ICustomMetadataProvider<Video>,
    IHasOrder
{
    private readonly GenreMappingService _mappingService;

    /// <summary>
    /// Initializes a new instance of the <see cref="GenreMappingProvider"/> class.
    /// </summary>
    /// <param name="mappingService">The genre mapping service.</param>
    public GenreMappingProvider(GenreMappingService mappingService)
    {
        _mappingService = mappingService;
    }

    /// <inheritdoc />
    public string Name => Plugin.PluginName;

    /// <inheritdoc />
    /// <remarks>After the other custom providers, in case they change the genres.</remarks>
    public int Order => 1000;

    /// <inheritdoc />
    public Task<ItemUpdateType> FetchAsync(Movie item, MetadataRefreshOptions options, CancellationToken cancellationToken) => Fetch(item);

    /// <inheritdoc />
    public Task<ItemUpdateType> FetchAsync(Series item, MetadataRefreshOptions options, CancellationToken cancellationToken) => Fetch(item);

    /// <inheritdoc />
    public Task<ItemUpdateType> FetchAsync(Season item, MetadataRefreshOptions options, CancellationToken cancellationToken) => Fetch(item);

    /// <inheritdoc />
    public Task<ItemUpdateType> FetchAsync(Episode item, MetadataRefreshOptions options, CancellationToken cancellationToken) => Fetch(item);

    /// <inheritdoc />
    public Task<ItemUpdateType> FetchAsync(BoxSet item, MetadataRefreshOptions options, CancellationToken cancellationToken) => Fetch(item);

    /// <inheritdoc />
    public Task<ItemUpdateType> FetchAsync(MusicVideo item, MetadataRefreshOptions options, CancellationToken cancellationToken) => Fetch(item);

    /// <inheritdoc />
    public Task<ItemUpdateType> FetchAsync(Trailer item, MetadataRefreshOptions options, CancellationToken cancellationToken) => Fetch(item);

    /// <inheritdoc />
    public Task<ItemUpdateType> FetchAsync(Video item, MetadataRefreshOptions options, CancellationToken cancellationToken) => Fetch(item);

    private Task<ItemUpdateType> Fetch(BaseItem item)
    {
        bool changed = _mappingService.MapGenres(item, GenreMap.FromConfiguration());
        return Task.FromResult(changed ? ItemUpdateType.MetadataEdit : ItemUpdateType.None);
    }
}
