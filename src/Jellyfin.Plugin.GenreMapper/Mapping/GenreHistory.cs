using System.Text.Json;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.GenreMapper.Mapping;

/// <summary>
/// The original genres of the items changed by the plugin, saved in the plugin data so they can be restored.
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
    /// Records a change of the genres of an item, keeping the original genres if the item was already changed by the plugin.
    /// </summary>
    /// <param name="itemId">The identifier of the item.</param>
    /// <param name="before">The genres before the change.</param>
    /// <param name="after">The genres after the change.</param>
    public void Record(Guid itemId, string[] before, string[] after)
    {
        lock (_lock)
        {
            // If the genres were changed by something else since the last change of the plugin, they are the new original genres
            string[] original = Changes.TryGetValue(itemId, out GenreChange? previous) && previous.Mapped.SequenceEqual(before, StringComparer.Ordinal)
                ? previous.Original
                : before;

            if (original.SequenceEqual(after, StringComparer.Ordinal))
            {
                Changes.Remove(itemId);
            }
            else
            {
                Changes[itemId] = new GenreChange { Original = original, Mapped = after };
            }

            ScheduleSave();
        }
    }

    /// <summary>
    /// Gets the saved changes.
    /// </summary>
    /// <returns>The changes by item identifier.</returns>
    public IReadOnlyList<KeyValuePair<Guid, GenreChange>> GetAll()
    {
        lock (_lock)
        {
            return Changes.ToArray();
        }
    }

    /// <summary>
    /// Forgets the change of an item.
    /// </summary>
    /// <param name="itemId">The identifier of the item.</param>
    public void Remove(Guid itemId)
    {
        lock (_lock)
        {
            if (Changes.Remove(itemId))
            {
                ScheduleSave();
            }
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
