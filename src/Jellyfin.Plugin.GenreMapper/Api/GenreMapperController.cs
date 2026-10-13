using System.Net.Mime;
using Jellyfin.Plugin.GenreMapper.Api.Models;
using Jellyfin.Plugin.GenreMapper.Configuration;
using Jellyfin.Plugin.GenreMapper.Genres;
using Jellyfin.Plugin.GenreMapper.Helpers;
using Jellyfin.Plugin.GenreMapper.Mapping;
using Jellyfin.Plugin.GenreMapper.Tasks;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Configuration;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.GenreMapper.Api;

/// <summary>
/// Endpoints used by the settings page.
/// </summary>
[ApiController]
[Route("GenreMapper")]
public class GenreMapperController : ControllerBase
{
    private const string TmdbOrigin = "TMDb";
    private const string TvdbOrigin = "TheTVDB";

    // Names of the metadata fetchers in the library settings
    private const string TmdbProvider = "TheMovieDb";
    private const string TvdbProvider = "TheTVDB";

    private static readonly FileExtensionContentTypeProvider _contentTypes = new();

    private readonly ILibraryManager _libraryManager;
    private readonly IServerConfigurationManager _configurationManager;
    private readonly ITaskManager _taskManager;
    private readonly GenreMappingService _mappingService;
    private readonly GenreHistory _history;
    private readonly ILogger<GenreMapperController> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="GenreMapperController"/> class.
    /// </summary>
    /// <param name="libraryManager">Instance of the <see cref="ILibraryManager"/> interface.</param>
    /// <param name="configurationManager">Instance of the <see cref="IServerConfigurationManager"/> interface.</param>
    /// <param name="taskManager">Instance of the <see cref="ITaskManager"/> interface.</param>
    /// <param name="mappingService">The genre mapping service.</param>
    /// <param name="history">The original genres of the changed items.</param>
    /// <param name="logger">Instance of the <see cref="ILogger{GenreMapperController}"/> interface.</param>
    public GenreMapperController(
        ILibraryManager libraryManager,
        IServerConfigurationManager configurationManager,
        ITaskManager taskManager,
        GenreMappingService mappingService,
        GenreHistory history,
        ILogger<GenreMapperController> logger)
    {
        _libraryManager = libraryManager;
        _configurationManager = configurationManager;
        _taskManager = taskManager;
        _mappingService = mappingService;
        _history = history;
        _logger = logger;
    }

    /// <summary>
    /// Gets a web file (script or translation) of the plugin.
    /// </summary>
    /// <param name="path">The path of the file relative to the web folder.</param>
    /// <response code="200">The file.</response>
    /// <response code="302">Redirection to the file of the configured commit.</response>
    /// <response code="404">The file does not exist.</response>
    /// <returns>The file content.</returns>
    [HttpGet("Web/{**path}")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status302Found)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetWebFile([FromRoute] string path)
    {
        if (!WebFiles.IsValidPath(path))
        {
            return NotFound();
        }

        string? commitUrl = WebFiles.GetCommitUrl(path);
        if (commitUrl is not null)
        {
            return Redirect(commitUrl);
        }

        Stream? stream = WebFiles.Open(path);
        if (stream is null)
        {
            return NotFound();
        }

        // Versioned URLs never change, the others must be revalidated
        Response.Headers.CacheControl = Request.Query.ContainsKey("v") ? "public, max-age=31536000, immutable" : "no-cache";

        string contentType = _contentTypes.TryGetContentType(path, out string? type) ? type : MediaTypeNames.Application.Octet;
        return File(stream, contentType);
    }

    /// <summary>
    /// Gets the data needed by the settings page: the known source genres and their translations.
    /// </summary>
    /// <response code="200">The data.</response>
    /// <returns>The data of the settings page.</returns>
    [HttpGet("Data")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<PageData> GetData()
    {
        // Genres of the items first, then the official genres of the providers used by the libraries
        Dictionary<string, SourceGenre> genres = new(StringComparer.Ordinal);
        foreach (string genre in _mappingService.GetItems().SelectMany(item => item.Genres))
        {
            GetOrAdd(genres, genre, null).Count++;
        }

        foreach ((string origin, IReadOnlyList<string> list) in GetOfficialGenres())
        {
            foreach (string genre in list)
            {
                GetOrAdd(genres, genre, origin);
            }
        }

        return new PageData
        {
            Version = WebFiles.GetVersionTag(),
            Languages = WebFiles.Languages,
            Genres = genres.Values.OrderBy(genre => genre.Name, StringComparer.CurrentCultureIgnoreCase).ToArray(),
            RestorableItems = _history.Count
        };
    }

    /// <summary>
    /// Computes the changes a mapping would make, without applying it.
    /// </summary>
    /// <param name="request">The mapping.</param>
    /// <response code="200">The changes.</response>
    /// <returns>The number of changed items and the number of items of the changed genres.</returns>
    [HttpPost("Preview")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<PreviewResult> Preview([FromBody] PreviewRequest request)
    {
        GenreMap map = GenreMap.Create(request.TargetGenres, request.Mappings);
        Dictionary<string, GenrePreview> genres = new(StringComparer.Ordinal);
        int changedItems = 0;

        foreach (BaseItem item in _mappingService.GetItems())
        {
            string[] before = item.Genres;
            string[] after = GenreMappingService.CanChangeGenres(item) ? map.Map(before) : before;

            if (!before.SequenceEqual(after, StringComparer.Ordinal))
            {
                changedItems++;
            }

            foreach (string genre in before)
            {
                GetOrAdd(genres, genre).Before++;
            }

            foreach (string genre in after)
            {
                GetOrAdd(genres, genre).After++;
            }
        }

        return new PreviewResult
        {
            ChangedItems = changedItems,
            Genres = genres.Values
                .Where(genre => genre.Before != genre.After)
                .OrderByDescending(genre => genre.After)
                .ThenBy(genre => genre.Name, StringComparer.CurrentCultureIgnoreCase)
                .ToArray()
        };
    }

    /// <summary>
    /// Resets the mapping (every genre is kept) and restores the original genres of the items changed by the plugin, in the background.
    /// </summary>
    /// <response code="204">The reset is started.</response>
    /// <returns>No content.</returns>
    [HttpPost("Reset")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public ActionResult Reset()
    {
        Plugin plugin = Plugin.Instance ?? throw new InvalidOperationException("The plugin is not loaded");
        PluginConfiguration current = plugin.Configuration;

        _logger.LogInformation("Resetting the genre mapping and restoring the original genres");

        // The mapping is reset first, so the restored genres are not mapped again
        plugin.UpdateConfiguration(new PluginConfiguration { CommitHash = current.CommitHash, Language = current.Language });
        _taskManager.CancelIfRunning<ApplyMappingTask>();
        _taskManager.QueueScheduledTask<RestoreGenresTask>();
        return NoContent();
    }

    private static SourceGenre GetOrAdd(Dictionary<string, SourceGenre> genres, string name, string? origin)
    {
        if (!genres.TryGetValue(name, out SourceGenre? genre))
        {
            genre = new SourceGenre { Name = name, Origins = [] };
            genres[name] = genre;
        }

        if (origin is not null && !genre.Origins.Contains(origin))
        {
            genre.Origins = [.. genre.Origins, origin];
        }

        return genre;
    }

    private static GenrePreview GetOrAdd(Dictionary<string, GenrePreview> genres, string name)
    {
        if (!genres.TryGetValue(name, out GenrePreview? genre))
        {
            genre = new GenrePreview { Name = name };
            genres[name] = genre;
        }

        return genre;
    }

    /// <summary>
    /// Gets the official genre lists of the TMDb and TheTVDB metadata fetchers enabled in the libraries:
    /// the TMDb movie genres for the movies, the TMDb TV genres for the series (in the metadata language of the library), and the TheTVDB genres.
    /// </summary>
    private IEnumerable<(string Origin, IReadOnlyList<string> Genres)> GetOfficialGenres()
    {
        string serverLanguage = _configurationManager.Configuration.PreferredMetadataLanguage;
        HashSet<string> seen = new(StringComparer.Ordinal);

        foreach (VirtualFolderInfo library in _libraryManager.GetVirtualFolders())
        {
            LibraryOptions options = library.LibraryOptions ?? new LibraryOptions();
            string language = string.IsNullOrWhiteSpace(options.PreferredMetadataLanguage) ? serverLanguage : options.PreferredMetadataLanguage;
            bool hasMovies = library.CollectionType is null or CollectionTypeOptions.movies;
            bool hasSeries = library.CollectionType is null or CollectionTypeOptions.tvshows;

            if (hasMovies && IsFetcherEnabled(options, nameof(Movie), TmdbProvider) && seen.Add("movie|" + language))
            {
                yield return (TmdbOrigin, KnownGenres.GetTmdbGenres(TmdbType.Movie, language));
            }

            if (hasSeries && IsFetcherEnabled(options, nameof(Series), TmdbProvider) && seen.Add("tv|" + language))
            {
                yield return (TmdbOrigin, KnownGenres.GetTmdbGenres(TmdbType.Tv, language));
            }

            if (hasSeries && IsFetcherEnabled(options, nameof(Series), TvdbProvider) && seen.Add("tvdb"))
            {
                yield return (TvdbOrigin, KnownGenres.TvdbGenres);
            }
        }
    }

    /// <summary>
    /// Gets a value indicating whether a metadata fetcher is enabled for a type of item in a library, like Jellyfin does.
    /// </summary>
    private bool IsFetcherEnabled(LibraryOptions options, string itemType, string fetcher)
    {
        TypeOptions? typeOptions = options.GetTypeOptions(itemType);
        if (typeOptions is not null)
        {
            return typeOptions.MetadataFetchers.Contains(fetcher, StringComparer.OrdinalIgnoreCase);
        }

        MetadataOptions? serverOptions = _configurationManager.GetMetadataOptionsForType(itemType);
        return serverOptions is null || !serverOptions.DisabledMetadataFetchers.Contains(fetcher, StringComparer.OrdinalIgnoreCase);
    }
}
