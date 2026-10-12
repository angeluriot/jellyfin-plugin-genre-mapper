using System.Globalization;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.GenreMapper.Api.Models;

namespace Jellyfin.Plugin.GenreMapper.Helpers;

/// <summary>
/// Access to the web files (scripts and translations) embedded in the plugin.
/// </summary>
public static partial class WebFiles
{
    private const string CdnUrl = "https://cdn.jsdelivr.net/gh/" + Plugin.Repository + "@{0}/src/Jellyfin.Plugin.GenreMapper/Web/{1}";

    private static readonly Assembly _assembly = typeof(Plugin).Assembly;

    private static readonly string _resourcePrefix = typeof(Plugin).Namespace + ".Web.";

    private static readonly Lazy<LanguageInfo[]> _languages = new(LoadLanguages);

    /// <summary>
    /// Gets the languages the plugin is translated into.
    /// </summary>
    public static LanguageInfo[] Languages => _languages.Value;

    /// <summary>
    /// Gets a value indicating whether a path is a valid web file path.
    /// </summary>
    /// <param name="path">The path relative to the web folder, like <c>Localization/en.json</c>.</param>
    /// <returns><c>true</c> if the path is valid.</returns>
    public static bool IsValidPath(string path) => PathRegex().IsMatch(path);

    /// <summary>
    /// Opens an embedded web file.
    /// </summary>
    /// <param name="path">The path relative to the web folder, like <c>Localization/en.json</c>.</param>
    /// <returns>The content of the file, or <c>null</c> if it does not exist.</returns>
    public static Stream? Open(string path) => _assembly.GetManifestResourceStream(_resourcePrefix + path.Replace('/', '.'));

    /// <summary>
    /// Gets the URL of a web file from the configured commit of the GitHub repository, if any.
    /// </summary>
    /// <param name="path">The path relative to the web folder.</param>
    /// <returns>The URL, or <c>null</c> if the embedded files should be used.</returns>
    public static string? GetCommitUrl(string path)
    {
        string commitHash = GetCommitHash();
        return commitHash.Length == 0 ? null : string.Format(CultureInfo.InvariantCulture, CdnUrl, commitHash, path);
    }

    /// <summary>
    /// Gets a string that changes whenever the served web files change, to bypass browser caches.
    /// </summary>
    /// <returns>The cache-busting version string.</returns>
    public static string GetVersionTag()
    {
        // The module id changes with every build, even without a version change
        string version = _assembly.ManifestModule.ModuleVersionId.ToString("N")[..8];
        string commitHash = GetCommitHash();
        return commitHash.Length == 0 ? version : version + "-" + commitHash;
    }

    private static string GetCommitHash()
    {
        string commitHash = Plugin.Instance?.Configuration.CommitHash.Trim() ?? string.Empty;
        return CommitHashRegex().IsMatch(commitHash) ? commitHash.ToLowerInvariant() : string.Empty;
    }

    private static LanguageInfo[] LoadLanguages()
    {
        string localizationPrefix = _resourcePrefix + "Localization.";

        return _assembly.GetManifestResourceNames()
            .Where(name => name.StartsWith(localizationPrefix, StringComparison.Ordinal) && name.EndsWith(".json", StringComparison.Ordinal))
            .Select(name =>
            {
                string code = name[localizationPrefix.Length..^".json".Length];
                using Stream stream = _assembly.GetManifestResourceStream(name)!;
                using JsonDocument document = JsonDocument.Parse(stream);
                string displayName = document.RootElement.TryGetProperty("LanguageName", out JsonElement value) ? value.GetString() ?? code : code;
                return new LanguageInfo { Code = code, Name = displayName };
            })
            .OrderBy(language => language.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    [GeneratedRegex("^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*\\.[a-z]+$")]
    private static partial Regex PathRegex();

    [GeneratedRegex("^[0-9a-fA-F]{7,40}$")]
    private static partial Regex CommitHashRegex();
}
