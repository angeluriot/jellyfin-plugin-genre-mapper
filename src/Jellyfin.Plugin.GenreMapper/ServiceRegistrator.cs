using Jellyfin.Plugin.GenreMapper.Mapping;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.GenreMapper;

/// <summary>
/// Registers the services of the plugin.
/// </summary>
public class ServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<GenreHistory>();
        serviceCollection.AddSingleton<GenreMappingService>();
        serviceCollection.AddHostedService<MappingChangeListener>();
    }
}
