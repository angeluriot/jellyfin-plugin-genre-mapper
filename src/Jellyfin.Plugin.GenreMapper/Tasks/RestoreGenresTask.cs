using Jellyfin.Plugin.GenreMapper.Mapping;
using MediaBrowser.Model.Tasks;

namespace Jellyfin.Plugin.GenreMapper.Tasks;

/// <summary>
/// Restores the original genres of the items changed by the plugin. Run by the reset of the settings page, which also resets the mapping.
/// </summary>
/// <remarks>Hidden, so it is not run by mistake without resetting the mapping (the genres would be mapped again by the next refresh).</remarks>
public class RestoreGenresTask : IScheduledTask, IConfigurableScheduledTask
{
    private readonly GenreMappingService _mappingService;

    /// <summary>
    /// Initializes a new instance of the <see cref="RestoreGenresTask"/> class.
    /// </summary>
    /// <param name="mappingService">The genre mapping service.</param>
    public RestoreGenresTask(GenreMappingService mappingService)
    {
        _mappingService = mappingService;
    }

    /// <inheritdoc />
    public string Name => "Restore the original genres";

    /// <inheritdoc />
    public string Key => "GenreMapperRestore";

    /// <inheritdoc />
    public string Description => "Restores the genres of the items changed by the Genre Mapper plugin.";

    /// <inheritdoc />
    public string Category => Plugin.PluginName;

    /// <inheritdoc />
    public bool IsHidden => true;

    /// <inheritdoc />
    public bool IsEnabled => true;

    /// <inheritdoc />
    public bool IsLogged => true;

    /// <inheritdoc />
    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() => [];

    /// <inheritdoc />
    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken) => _mappingService.RestoreAsync(progress, cancellationToken);
}
