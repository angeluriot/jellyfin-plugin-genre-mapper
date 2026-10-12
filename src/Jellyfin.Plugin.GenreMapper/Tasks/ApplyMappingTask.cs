using Jellyfin.Plugin.GenreMapper.Mapping;
using MediaBrowser.Model.Tasks;

namespace Jellyfin.Plugin.GenreMapper.Tasks;

/// <summary>
/// Applies the genre mapping to the whole library. Also run when the mapping is saved.
/// </summary>
public class ApplyMappingTask : IScheduledTask
{
    private readonly GenreMappingService _mappingService;

    /// <summary>
    /// Initializes a new instance of the <see cref="ApplyMappingTask"/> class.
    /// </summary>
    /// <param name="mappingService">The genre mapping service.</param>
    public ApplyMappingTask(GenreMappingService mappingService)
    {
        _mappingService = mappingService;
    }

    /// <inheritdoc />
    public string Name => "Apply the genre mapping";

    /// <inheritdoc />
    public string Key => "GenreMapperApply";

    /// <inheritdoc />
    public string Description => "Replaces the genres of all the items according to the mapping of the Genre Mapper plugin.";

    /// <inheritdoc />
    public string Category => Plugin.PluginName;

    /// <inheritdoc />
    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        // The genres are already mapped when the metadata is refreshed, this only catches the other changes
        yield return new TaskTriggerInfo { Type = TaskTriggerInfoType.IntervalTrigger, IntervalTicks = TimeSpan.FromDays(1).Ticks };
    }

    /// <inheritdoc />
    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken) => _mappingService.ApplyAsync(progress, cancellationToken);
}
