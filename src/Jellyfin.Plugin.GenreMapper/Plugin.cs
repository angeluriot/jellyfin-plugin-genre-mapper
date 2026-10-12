using Jellyfin.Plugin.GenreMapper.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.GenreMapper;

/// <summary>
/// The Genre Mapper plugin.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// The GitHub repository of the plugin, used to load the web files of a specific commit.
    /// </summary>
    public const string Repository = "angeluriot/jellyfin-plugin-genre-mapper";

    /// <summary>
    /// The name of the plugin.
    /// </summary>
    public const string PluginName = "Genre Mapper";

    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    /// <param name="xmlSerializer">Instance of the <see cref="IXmlSerializer"/> interface.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <summary>
    /// Gets the current plugin instance.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc />
    public override string Name => PluginName;

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("d92c00c2-a490-44ec-9822-d2db5bdbfd0e");

    /// <inheritdoc />
    public override string Description => "Maps the genres of the items to a list of genres chosen by the administrator, directly in the metadata.";

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        string prefix = GetType().Namespace + ".Configuration.";

        return
        [
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = prefix + "configPage.html",
                EnableInMainMenu = true,
                MenuIcon = "theater_comedy"
            },
            new PluginPageInfo
            {
                Name = "GenreMapperConfigController",
                EmbeddedResourcePath = prefix + "configController.js"
            }
        ];
    }
}
