using System.Text.Json;
using Jellyfin.Plugin.GenreMapper.Configuration;
using Jellyfin.Plugin.GenreMapper.Tasks;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.GenreMapper.Mapping;

/// <summary>
/// Applies the mapping to the whole library when it is changed in the configuration.
/// </summary>
public sealed class MappingChangeListener : IHostedService
{
    private readonly ITaskManager _taskManager;
    private readonly ILogger<MappingChangeListener> _logger;
    private string _mappingSignature = string.Empty;

    /// <summary>
    /// Initializes a new instance of the <see cref="MappingChangeListener"/> class.
    /// </summary>
    /// <param name="taskManager">Instance of the <see cref="ITaskManager"/> interface.</param>
    /// <param name="logger">Instance of the <see cref="ILogger{MappingChangeListener}"/> interface.</param>
    public MappingChangeListener(ITaskManager taskManager, ILogger<MappingChangeListener> logger)
    {
        _taskManager = taskManager;
        _logger = logger;
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (Plugin.Instance is not null)
        {
            _mappingSignature = GetSignature(Plugin.Instance.Configuration);
            Plugin.Instance.ConfigurationChanged += OnConfigurationChanged;
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        if (Plugin.Instance is not null)
        {
            Plugin.Instance.ConfigurationChanged -= OnConfigurationChanged;
        }

        return Task.CompletedTask;
    }

    private static string GetSignature(PluginConfiguration configuration) =>
        JsonSerializer.Serialize(new { configuration.TargetGenres, configuration.Mappings });

    private void OnConfigurationChanged(object? sender, BasePluginConfiguration e)
    {
        if (e is not PluginConfiguration configuration)
        {
            return;
        }

        string signature = GetSignature(configuration);
        if (signature == _mappingSignature)
        {
            return;
        }

        // Also when the mapping is reset, to restore the original genres
        _mappingSignature = signature;
        _logger.LogInformation("The genre mapping changed, applying it to the library");
        _taskManager.QueueScheduledTask<ApplyMappingTask>();
    }
}
