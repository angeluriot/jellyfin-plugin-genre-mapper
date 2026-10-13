using System.Text.Json;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.GenreMapper.Mapping;

/// <summary>
/// The original genres of the items changed by the plugin (the ones given by the metadata providers or set by hand),
/// saved next to the configuration so the mapping is always applied to them and they can be restored.
/// </summary>
public sealed class GenreHistory : IDisposable
{
    private static readonly TimeSpan _saveDelay = TimeSpan.FromSeconds(5);

    private readonly string _path;
    private readonly ILogger<GenreHistory> _logger;
    private readonly Lock _lock = new();
    private readonly Timer _saveTimer;
    private Dictionary<Guid, GenreChange>? _changes;
    private bool _isDirty;

    /// <summary>
    /// Initializes a new instance of the <see cref="GenreHistory"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    /// <param name="logger">Instance of the <see cref="ILogger{GenreHistory}"/> interface.</param>
    public GenreHistory(IApplicationPaths applicationPaths, ILogger<GenreHistory> logger)
    {
        // Next to the configuration of the plugin, which is kept when the plugin is updated
        _path = Path.Combine(applicationPaths.PluginConfigurationsPath, "Jellyfin.Plugin.GenreMapper", "original-genres.json");
        _logger = logger;
        _saveTimer = new Timer(_ => Save());
    }

    /// <summary>
    /// Gets the number of items whose original genres are saved.
    /// </summary>
    public int Count
    {
        get
        {
            lock (_lock)
            {
                return Changes.Count;
            }
        }
    }

    private Dictionary<Guid, GenreChange> Changes => _changes ??= Load();

    /// <summary>
    /// Gets the original genres of an item.
    /// </summary>
    /// <param name="itemId">The identifier of the item.</param>
    /// <param name="genres">The current genres of the item.</param>
    /// <returns>
    /// The genres before the changes of the plugin if the current genres are still the ones set by the plugin,
    /// the current genres otherwise (never changed by the plugin, or changed by something else since, like a metadata refresh or a manual edit).
    /// </returns>
    public string[] GetOriginal(Guid itemId, string[] genres)
    {
        lock (_lock)
        {
            return Changes.TryGetValue(itemId, out GenreChange? change) && change.Mapped.SequenceEqual(genres, StringComparer.Ordinal)
                ? change.Original
                : genres;
        }
    }

    /// <summary>
    /// Records the genres set by the plugin on an item.
    /// </summary>
    /// <param name="itemId">The identifier of the item.</param>
    /// <param name="original">The original genres of the item.</param>
    /// <param name="mapped">The genres set by the plugin.</param>
    public void Record(Guid itemId, string[] original, string[] mapped)
    {
        lock (_lock)
        {
            if (original.SequenceEqual(mapped, StringComparer.Ordinal))
            {
                Changes.Remove(itemId);
            }
            else
            {
                Changes[itemId] = new GenreChange { Original = original, Mapped = mapped };
            }

            ScheduleSave();
        }
    }

    /// <summary>
    /// Saves the pending changes now.
    /// </summary>
    public void Save()
    {
        lock (_lock)
        {
            if (!_isDirty || _changes is null)
            {
                return;
            }

            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
                string temporaryPath = _path + ".tmp";
                File.WriteAllText(temporaryPath, JsonSerializer.Serialize(_changes));
                File.Move(temporaryPath, _path, true);
                _isDirty = false;
            }
            catch (Exception exception)
            {
                _logger.LogError(exception, "Failed to save the original genres to {Path}", _path);
            }
        }
    }

    /// <inheritdoc />
    public void Dispose()
    {
        _saveTimer.Dispose();
        Save();
    }

    // Changes often come in bursts (library scans), so they are saved a few seconds after the last one
    private void ScheduleSave()
    {
        _isDirty = true;
        _saveTimer.Change(_saveDelay, Timeout.InfiniteTimeSpan);
    }

    private Dictionary<Guid, GenreChange> Load()
    {
        if (!File.Exists(_path))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<Dictionary<Guid, GenreChange>>(File.ReadAllText(_path)) ?? [];
        }
        catch (Exception exception)
        {
            // Never overwrite a file that could not be read, the original genres would be lost
            string backupPath = _path + "." + DateTime.UtcNow.ToString("yyyyMMddHHmmss", System.Globalization.CultureInfo.InvariantCulture) + ".bak";
            _logger.LogError(exception, "Failed to read the original genres from {Path}, the file is moved to {BackupPath}", _path, backupPath);
            File.Move(_path, backupPath);
            return [];
        }
    }
}
